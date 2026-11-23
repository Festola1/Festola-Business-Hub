import { Plus, Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import {
  AlertBanner,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
} from '../../components/ui/Feedback';
import { CheckboxField, FormField, Input, Select } from '../../components/ui/FormControls';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import {
  createProduct,
  createProductCategory,
  fetchProductCategories,
  fetchProducts,
  updateProduct,
  type ProductCategory,
  type ProductItem,
} from '../../lib/commerce-api';
import { getFriendlyApiError } from '../../lib/error-messages';
import { formatMoney, formatQty } from '../../lib/format';
import { canRoleAccess } from '../../lib/permissions';

export default function ProductsPage() {
  const { accessToken, activeMembership } = useAuth();
  const { pushToast } = useToast();

  const role = activeMembership?.role ?? 'cashier';
  const canManage = canRoleAccess(role, 'products.manage');
  const canViewCost = canRoleAccess(role, 'products.view_cost');
  const isReadOnly =
    activeMembership?.subscriptionStatus === 'read_only' ||
    activeMembership?.subscriptionStatus === 'cancelled';

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Create / Edit Product modal state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [pName, setPName] = useState('');
  const [pCategoryId, setPCategoryId] = useState('');
  const [pSku, setPSku] = useState('');
  const [pBarcode, setPBarcode] = useState('');
  const [pUnit, setPUnit] = useState('pcs');
  const [pSellingPrice, setPSellingPrice] = useState('');
  const [pCostPrice, setPCostPrice] = useState('0');
  const [pOpeningStock, setPOpeningStock] = useState('0');
  const [pReorderLevel, setPReorderLevel] = useState('5');
  const [pTaxExempt, setPTaxExempt] = useState(false);
  const [pFormError, setPFormError] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);

  // Category modal state
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catError, setCatError] = useState<string | null>(null);
  const [savingCat, setSavingCat] = useState(false);

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;

    void Promise.all([
      fetchProductCategories(accessToken, activeMembership.businessId),
      fetchProducts(accessToken, activeMembership.businessId, {
        search,
        categoryId: categoryFilter || undefined,
        lowStockOnly,
        limit: 100,
      }),
    ]).then(([catRes, prodRes]) => {
      if (cancelled) {
        return;
      }
      if (!prodRes.success || !prodRes.data) {
        setErrorMessage(getFriendlyApiError(prodRes.error, 'Unable to load products.'));
        setLoading(false);
        return;
      }
      if (catRes.success && catRes.data) {
        setCategories(catRes.data.categories);
      }
      setProducts(prodRes.data.products);
      setErrorMessage(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, search, categoryFilter, lowStockOnly, reloadTick]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setPName('');
    setPCategoryId('');
    setPSku('');
    setPBarcode('');
    setPUnit('pcs');
    setPSellingPrice('');
    setPCostPrice('0');
    setPOpeningStock('0');
    setPReorderLevel('5');
    setPTaxExempt(false);
    setPFormError(null);
    setProductModalOpen(true);
  };

  const openEditModal = (product: ProductItem) => {
    setEditingProduct(product);
    setPName(product.name);
    setPCategoryId(product.categoryId ?? '');
    setPSku(product.sku ?? '');
    setPBarcode(product.barcode ?? '');
    setPUnit(product.unit);
    setPSellingPrice(String(Number(product.sellingPrice)));
    setPReorderLevel(String(Number(product.reorderLevel)));
    setPTaxExempt(product.isTaxExempt);
    setPFormError(null);
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership) return;
    setPFormError(null);

    if (pName.trim().length < 2) {
      setPFormError('Enter a product name (at least 2 characters).');
      return;
    }
    if (!Number.isFinite(Number(pSellingPrice)) || Number(pSellingPrice) <= 0) {
      setPFormError('Enter a valid selling price greater than 0.');
      return;
    }

    setSavingProduct(true);
    const res = editingProduct
      ? await updateProduct(accessToken, activeMembership.businessId, editingProduct.id, {
          name: pName.trim(),
          categoryId: pCategoryId || null,
          sku: pSku.trim() || null,
          barcode: pBarcode.trim() || null,
          unit: pUnit.trim() || 'pcs',
          sellingPrice: Number(pSellingPrice).toFixed(2),
          reorderLevel: Number(pReorderLevel || 0).toFixed(3),
          isTaxExempt: pTaxExempt,
        })
      : await createProduct(accessToken, activeMembership.businessId, {
          name: pName.trim(),
          categoryId: pCategoryId || null,
          sku: pSku.trim() || null,
          barcode: pBarcode.trim() || null,
          unit: pUnit.trim() || 'pcs',
          sellingPrice: Number(pSellingPrice).toFixed(2),
          costPrice: Number(pCostPrice || 0).toFixed(2),
          openingStock: Number(pOpeningStock || 0).toFixed(3),
          reorderLevel: Number(pReorderLevel || 0).toFixed(3),
          isTaxExempt: pTaxExempt,
        });
    setSavingProduct(false);

    if (!res.success) {
      setPFormError(getFriendlyApiError(res.error, 'Unable to save product.'));
      return;
    }

    setProductModalOpen(false);
    pushToast(editingProduct ? 'Product updated.' : 'Product added to catalog.', 'success');
    setReloadTick((n) => n + 1);
  };

  const handleCreateCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership) return;
    setCatError(null);
    if (catName.trim().length < 2) {
      setCatError('Category name must be at least 2 characters.');
      return;
    }
    setSavingCat(true);
    const res = await createProductCategory(accessToken, activeMembership.businessId, {
      name: catName.trim(),
    });
    setSavingCat(false);
    if (!res.success) {
      setCatError(getFriendlyApiError(res.error, 'Unable to create category.'));
      return;
    }
    setCatName('');
    setCatModalOpen(false);
    pushToast('Product category created.', 'success');
    setReloadTick((n) => n + 1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Products & Catalog"
        description={
          canViewCost
            ? 'Manage product pricing, SKU/barcodes, tax-exempt flags, and weighted-average cost.'
            : 'Browse selling prices, SKU/barcodes, and live stock availability.'
        }
        actions={
          canManage ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={isReadOnly}
                onClick={() => {
                  setCatError(null);
                  setCatModalOpen(true);
                }}
              >
                New Category
              </Button>
              <Button variant="primary" size="sm" disabled={isReadOnly} onClick={openCreateModal}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add Product</span>
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-12 md:items-center">
          <div className="relative md:col-span-5">
            <label htmlFor="product-search" className="sr-only">
              Search products
            </label>
            <Search
              className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#52525B]"
              aria-hidden="true"
            />
            <Input
              id="product-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, SKU, or barcode..."
              className="pl-10"
            />
          </div>

          <div className="md:col-span-4">
            <label htmlFor="category-filter" className="sr-only">
              Filter by category
            </label>
            <Select
              id="category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="md:col-span-3">
            <CheckboxField
              id="low-stock-filter"
              checked={lowStockOnly}
              onChange={(e) => setLowStockOnly(e.target.checked)}
              label="Low stock only"
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingSkeleton rows={5} label="Loading products..." />
      ) : errorMessage ? (
        <ErrorState
          message={errorMessage}
          onRetry={() => {
            setLoading(true);
            setReloadTick((n) => n + 1);
          }}
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products found"
          description={
            search || categoryFilter || lowStockOnly
              ? 'No items matched your current filters. Clear filters to see your full catalog.'
              : 'Add your first product with selling price and optional opening stock to start selling at the counter.'
          }
          action={
            canManage && !isReadOnly ? (
              <Button variant="primary" size="sm" onClick={openCreateModal}>
                Add First Product
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7]/60 text-xs text-[#52525B]">
                <tr>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 text-right font-medium">Selling Price</th>
                  {canViewCost && <th className="px-4 py-3 text-right font-medium">WAC Cost</th>}
                  <th className="px-4 py-3 text-right font-medium">On Hand</th>
                  {canManage && <th className="px-5 py-3 text-right font-medium">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {products.map((product) => {
                  const isLow = Number(product.onHand) <= Number(product.reorderLevel);
                  return (
                    <tr key={product.id} className="hover:bg-[#F4F5F7]/40">
                      <td className="px-5 py-3">
                        <p className="font-medium text-[#18181B]">{product.name}</p>
                        <p className="font-mono-tabular text-xs text-[#52525B]">
                          {product.sku ? `SKU ${product.sku}` : 'No SKU'}
                          {product.barcode ? ` · ${product.barcode}` : ''}
                          {product.isTaxExempt ? ' · Tax-exempt' : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular font-medium text-[#18181B]">
                        {formatMoney(product.sellingPrice)}
                      </td>
                      {canViewCost && (
                        <td className="px-4 py-3 text-right font-mono-tabular text-xs text-[#52525B]">
                          {formatMoney(product.weightedAvgCost ?? product.costPrice ?? '0')}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right font-mono-tabular">
                        <span
                          className={
                            isLow ? 'font-semibold text-[#D97706]' : 'font-medium text-[#18181B]'
                          }
                        >
                          {formatQty(product.onHand)} {product.unit}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-5 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isReadOnly}
                            onClick={() => openEditModal(product)}
                          >
                            Edit
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create / Edit Product Modal */}
      <Modal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
        description={
          editingProduct
            ? 'Update selling price, barcode, category, or reorder level. Use Restock/Adjustments to change stock quantities.'
            : 'Create a catalog item. Initial stock and unit cost initialize moving weighted average cost.'
        }
      >
        <form onSubmit={(e) => void handleSaveProduct(e)} className="space-y-3.5" noValidate>
          {pFormError && <AlertBanner tone="error">{pFormError}</AlertBanner>}

          <FormField id="prod-name" label="Product name" required>
            <Input
              id="prod-name"
              required
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              placeholder="Peak Evaporated Milk 160g"
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="prod-cat" label="Category">
              <Select
                id="prod-cat"
                value={pCategoryId}
                onChange={(e) => setPCategoryId(e.target.value)}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField id="prod-unit" label="Unit" required>
              <Input
                id="prod-unit"
                value={pUnit}
                onChange={(e) => setPUnit(e.target.value)}
                placeholder="pcs, pack, bag, kg"
              />
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="prod-sku" label="SKU (optional)">
              <Input id="prod-sku" mono value={pSku} onChange={(e) => setPSku(e.target.value)} />
            </FormField>

            <FormField id="prod-barcode" label="Barcode (optional)">
              <Input
                id="prod-barcode"
                mono
                value={pBarcode}
                onChange={(e) => setPBarcode(e.target.value)}
              />
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="prod-price" label="Selling price (₦)" required>
              <Input
                id="prod-price"
                type="number"
                mono
                step="0.01"
                min="0.01"
                required
                value={pSellingPrice}
                onChange={(e) => setPSellingPrice(e.target.value)}
              />
            </FormField>

            <FormField id="prod-reorder" label="Reorder level">
              <Input
                id="prod-reorder"
                type="number"
                mono
                step="0.001"
                min="0"
                value={pReorderLevel}
                onChange={(e) => setPReorderLevel(e.target.value)}
              />
            </FormField>
          </div>

          {!editingProduct && canViewCost && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="prod-cost" label="Initial unit cost (₦)">
                <Input
                  id="prod-cost"
                  type="number"
                  mono
                  step="0.01"
                  min="0"
                  value={pCostPrice}
                  onChange={(e) => setPCostPrice(e.target.value)}
                />
              </FormField>
              <FormField id="prod-opening" label="Opening stock">
                <Input
                  id="prod-opening"
                  type="number"
                  mono
                  step="0.001"
                  min="0"
                  value={pOpeningStock}
                  onChange={(e) => setPOpeningStock(e.target.value)}
                />
              </FormField>
            </div>
          )}

          <CheckboxField
            id="prod-tax-exempt"
            checked={pTaxExempt}
            onChange={(e) => setPTaxExempt(e.target.checked)}
            label="Tax-exempt item"
            description="Skip store-wide flat sales tax for this product even when business tax is enabled."
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setProductModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={savingProduct}
              loadingLabel="Saving..."
            >
              {editingProduct ? 'Save changes' : 'Create product'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Category Modal */}
      <Modal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title="New Product Category"
      >
        <form onSubmit={(e) => void handleCreateCategory(e)} className="space-y-4" noValidate>
          {catError && <AlertBanner tone="error">{catError}</AlertBanner>}
          <FormField id="cat-name" label="Category name" required>
            <Input
              id="cat-name"
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Beverages"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCatModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingCat} loadingLabel="Saving...">
              Create category
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
