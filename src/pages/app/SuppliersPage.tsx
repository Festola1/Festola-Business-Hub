import { Edit3, Eye, Plus, Search, Truck, Wallet } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { AlertBanner, Card, EmptyState, PageHeader } from '../../components/ui/Feedback';
import { FormField, Input, Select } from '../../components/ui/FormControls';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import type { TenderMethod } from '../../lib/commerce-api';
import { formatDateTime, formatMoney, generateUuid } from '../../lib/format';
import {
  listWorkspaceSuppliers,
  saveWorkspaceSuppliers,
  type SupplierRecord,
} from '../../lib/offline-store';

export default function SuppliersPage() {
  const { activeMembership } = useAuth();
  const { pushToast } = useToast();
  const businessId = activeMembership?.businessId ?? '';

  const [suppliers, setSuppliers] = useState<SupplierRecord[]>(() =>
    businessId ? listWorkspaceSuppliers(businessId) : [],
  );
  const [search, setSearch] = useState('');

  // Add / Edit Modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [productsSupplied, setProductsSupplied] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [editorError, setEditorError] = useState<string | null>(null);

  // Profile Modal
  const [profileSupplier, setProfileSupplier] = useState<SupplierRecord | null>(null);

  // Payment Modal
  const [paySupplier, setPaySupplier] = useState<SupplierRecord | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<Exclude<TenderMethod, 'credit'>>('transfer');
  const [payRef, setPayRef] = useState('');
  const [payError, setPayError] = useState<string | null>(null);

  const persist = (next: SupplierRecord[]) => {
    setSuppliers(next);
    if (businessId) {
      saveWorkspaceSuppliers(businessId, next);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        s.productsSupplied.toLowerCase().includes(q),
    );
  }, [suppliers, search]);

  const totalPurchases = useMemo(
    () => suppliers.reduce((sum, s) => sum + s.totalPurchases, 0),
    [suppliers],
  );
  const totalPayables = useMemo(
    () => suppliers.reduce((sum, s) => sum + s.outstandingBalance, 0),
    [suppliers],
  );

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setProductsSupplied('');
    setOpeningBalance('0');
    setEditorError(null);
    setEditorOpen(true);
  };

  const openEditModal = (supplier: SupplierRecord) => {
    setEditingId(supplier.id);
    setName(supplier.name);
    setPhone(supplier.phone);
    setEmail(supplier.email);
    setAddress(supplier.address);
    setProductsSupplied(supplier.productsSupplied);
    setOpeningBalance(String(supplier.outstandingBalance));
    setEditorError(null);
    setEditorOpen(true);
  };

  const handleSaveSupplier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditorError(null);
    if (name.trim().length < 2) {
      setEditorError('Supplier name must be at least 2 characters.');
      return;
    }
    const parsedBalance = Number(openingBalance || '0');
    if (!Number.isFinite(parsedBalance) || parsedBalance < 0) {
      setEditorError('Outstanding balance must be zero or positive.');
      return;
    }

    if (editingId) {
      const next = suppliers.map((s) =>
        s.id === editingId
          ? {
              ...s,
              name: name.trim(),
              phone: phone.trim(),
              email: email.trim(),
              address: address.trim(),
              productsSupplied: productsSupplied.trim(),
              outstandingBalance: parsedBalance,
            }
          : s,
      );
      persist(next);
      pushToast('Supplier details updated.', 'success');
    } else {
      const created: SupplierRecord = {
        id: generateUuid(),
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        productsSupplied: productsSupplied.trim(),
        totalPurchases: 0,
        outstandingBalance: parsedBalance,
        payments: [],
        createdAt: new Date().toISOString(),
      };
      persist([created, ...suppliers]);
      pushToast('Supplier added to workspace directory.', 'success');
    }
    setEditorOpen(false);
  };

  const handleRecordPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paySupplier) return;
    setPayError(null);

    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayError('Enter a payment amount greater than zero.');
      return;
    }

    const paymentRecord = {
      id: generateUuid(),
      amount: amount.toFixed(2),
      method: payMethod,
      paidAt: new Date().toISOString(),
      referenceNote: payRef.trim() || 'Supplier settlement',
    };

    const next = suppliers.map((s) =>
      s.id === paySupplier.id
        ? {
            ...s,
            outstandingBalance: Math.max(0, Number((s.outstandingBalance - amount).toFixed(2))),
            payments: [paymentRecord, ...s.payments],
          }
        : s,
    );
    persist(next);
    const updated = next.find((s) => s.id === paySupplier.id) ?? null;
    if (profileSupplier?.id === paySupplier.id) {
      setProfileSupplier(updated);
    }
    setPaySupplier(null);
    setPayAmount('');
    setPayRef('');
    pushToast('Supplier payment recorded.', 'success');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Supplier Management"
        description="Manage wholesalers and vendors supplying your store, track balances, and log supplier settlements."
        actions={
          <Button variant="primary" onClick={openAddModal}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Supplier</span>
          </Button>
        }
      />

      <AlertBanner tone="info" title="Local Workspace Directory (Backend Sync Ready)">
        Supplier profiles and settlements are stored per business in your browser&apos;s offline
        IndexedDB storage and link directly to Purchase Orders. Connect the dedicated{' '}
        <span className="font-mono-tabular">/api/v1/suppliers</span> backend table when ready to
        sync across devices.
      </AlertBanner>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#6B7280]">Total Suppliers</p>
          <p className="mt-2 font-mono-tabular text-2xl font-extrabold text-[#151B2B]">
            {suppliers.length}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#6B7280]">Total Purchases Logged</p>
          <p className="mt-2 font-mono-tabular text-2xl font-extrabold text-[#151B2B]">
            {formatMoney(totalPurchases)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#6B7280]">Outstanding Supplier Balance</p>
          <p className="mt-2 font-mono-tabular text-2xl font-extrabold text-[#D90000]">
            {formatMoney(totalPayables)}
          </p>
        </Card>
      </div>

      {/* Suppliers Table */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-[#E5E7EB] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-[#D90000]" aria-hidden="true" />
            <h2 className="text-base font-bold text-[#151B2B]">Suppliers Directory</h2>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplier, phone, products..."
              aria-label="Search suppliers"
              className="pl-9"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No suppliers added yet"
              description="Add your wholesalers, distributors, and product vendors so you can link them to Purchase Orders and track balances."
              action={
                <Button variant="primary" onClick={openAddModal}>
                  Add First Supplier
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] text-left text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F8F8FA] text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                <tr>
                  <th className="px-5 py-3">Supplier</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Products Supplied</th>
                  <th className="px-4 py-3 text-right">Total Purchases</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filtered.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-[#F8F8FA]/70">
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-[#151B2B]">{supplier.name}</p>
                      <p className="text-xs text-[#6B7280]">{supplier.address || 'No address'}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#4B5565]">
                      <p>{supplier.phone || '—'}</p>
                      <p className="text-[#6B7280]">{supplier.email || ''}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#4B5565]">
                      {supplier.productsSupplied || 'General stock'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-tabular text-xs font-semibold text-[#151B2B]">
                      {formatMoney(supplier.totalPurchases)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-tabular text-xs font-bold text-[#D90000]">
                      {formatMoney(supplier.outstandingBalance)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          onClick={() => setProfileSupplier(supplier)}
                          aria-label={`View profile for ${supplier.name}`}
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Profile</span>
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => openEditModal(supplier)}
                          aria-label={`Edit ${supplier.name}`}
                        >
                          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="primary"
                          onClick={() => {
                            setPaySupplier(supplier);
                            setPayAmount('');
                            setPayRef('');
                            setPayError(null);
                          }}
                        >
                          <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Pay</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit Supplier Modal */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? 'Edit Supplier' : 'Add Supplier'}
        description="Maintain accurate supplier contact details and opening balances."
      >
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          {editorError && <AlertBanner tone="error">{editorError}</AlertBanner>}

          <FormField id="sup-name" label="Supplier Name" required>
            <Input
              id="sup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Oke-Arin Wholesale Distributors"
              required
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id="sup-phone" label="Phone Number">
              <Input
                id="sup-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0803 000 0000"
              />
            </FormField>
            <FormField id="sup-email" label="Email Address">
              <Input
                id="sup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="orders@supplier.ng"
              />
            </FormField>
          </div>

          <FormField id="sup-address" label="Address">
            <Input
              id="sup-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Market stall or warehouse address"
            />
          </FormField>

          <FormField id="sup-products" label="Products Supplied">
            <Input
              id="sup-products"
              value={productsSupplied}
              onChange={(e) => setProductsSupplied(e.target.value)}
              placeholder="e.g. Beverages, Cooking Oil, Noodles"
            />
          </FormField>

          <FormField id="sup-balance" label="Outstanding Balance (NGN)">
            <Input
              id="sup-balance"
              type="number"
              min="0"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingId ? 'Save Changes' : 'Save Supplier'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Supplier Profile & Payment History Modal */}
      <Modal
        open={Boolean(profileSupplier)}
        onClose={() => setProfileSupplier(null)}
        title={profileSupplier?.name ?? 'Supplier Profile'}
        description="Supplier overview, supplied categories, and settlement history."
      >
        {profileSupplier && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#E5E7EB] bg-[#F8F8FA] p-4">
              <div>
                <p className="text-xs text-[#6B7280]">Total Purchases</p>
                <p className="font-mono-tabular text-base font-bold text-[#151B2B]">
                  {formatMoney(profileSupplier.totalPurchases)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280]">Outstanding Balance</p>
                <p className="font-mono-tabular text-base font-bold text-[#D90000]">
                  {formatMoney(profileSupplier.outstandingBalance)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280]">Phone</p>
                <p className="font-medium text-[#151B2B]">{profileSupplier.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280]">Email</p>
                <p className="font-medium text-[#151B2B]">{profileSupplier.email || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-[#6B7280]">Products Supplied</p>
                <p className="font-medium text-[#151B2B]">
                  {profileSupplier.productsSupplied || 'General merchandise'}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#6B7280]">
                Payment History
              </h3>
              {profileSupplier.payments.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed border-[#E5E7EB] p-4 text-xs text-[#6B7280]">
                  No supplier payments recorded yet.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-[#F1F5F9] rounded-xl border border-[#E5E7EB]">
                  {profileSupplier.payments.map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-xs font-semibold text-[#151B2B]">
                          {payment.referenceNote}
                        </p>
                        <p className="font-mono-tabular text-[11px] text-[#6B7280]">
                          {formatDateTime(payment.paidAt)} · {payment.method.replace('_', ' ')}
                        </p>
                      </div>
                      <span className="font-mono-tabular text-xs font-bold text-[#16A34A]">
                        {formatMoney(payment.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Record Supplier Payment Modal */}
      <Modal
        open={Boolean(paySupplier)}
        onClose={() => setPaySupplier(null)}
        title={`Record Payment — ${paySupplier?.name ?? ''}`}
        description="Log a verified payment made to this supplier."
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          {payError && <AlertBanner tone="error">{payError}</AlertBanner>}
          {paySupplier && (
            <div className="rounded-xl bg-[#FFF5F5] p-3 text-xs text-[#7F1D1D]">
              Current outstanding balance:{' '}
              <strong className="font-mono-tabular">
                {formatMoney(paySupplier.outstandingBalance)}
              </strong>
            </div>
          )}

          <FormField id="sup-pay-amount" label="Amount Paid (NGN)" required>
            <Input
              id="sup-pay-amount"
              type="number"
              min="1"
              step="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              required
            />
          </FormField>

          <FormField id="sup-pay-method" label="Payment Method" required>
            <Select
              id="sup-pay-method"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as Exclude<TenderMethod, 'credit'>)}
            >
              <option value="transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="pos_card">POS Card</option>
            </Select>
          </FormField>

          <FormField id="sup-pay-ref" label="Reference Note">
            <Input
              id="sup-pay-ref"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="Transfer reference or voucher number"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPaySupplier(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Record Supplier Payment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
