# Festola Business Hub — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants & Master Source of Truth

1. **Global Default Deny:** All unmatched paths under `/databases/{database}/documents` are denied by default (`allow read, write: if false;`).
2. **Verified Identity Requirement:** All client writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Isolation (Split Collection):** User email and phone number are strictly stored in `/users/{userId}/private/{docId}`, readable and writable ONLY by the owning user (`request.auth.uid == userId`) or a verified admin. No blanket `isSignedIn()` reads exist anywhere.
4. **Master Gate & Tenant Isolation:** Every supplier under `/businesses/{businessId}/suppliers/{supplierId}` derives authorization from the parent `/businesses/{businessId}` document (`get(...).data.ownerId == request.auth.uid`), ensuring instant synchronous revocation if parent ownership changes or business is deleted.
5. **Immutable Identity & Temporal Integrity:** `uid`, `ownerId`, `businessId`, `id`, and `createdAt` are immutable after creation. `createdAt == request.time` on `create` and `updatedAt == request.time` on `update`.
6. **Terminal State Locking:** Once a document's `status == 'archived'`, non-admin clients cannot perform further updates.
7. **Volumetric & Array Boundaries:** Every string has explicit `.size()` bounds matching `firebase-blueprint.json`, IDs match `^[a-zA-Z0-9_\-]+$` (<= 128 chars), and `payments` arrays are bounded to `<= 50` map elements.
8. **Query Enforcer:** Every `allow list` rule evaluates `resource.data.ownerId == request.auth.uid` (no `get()`/`exists()` inside `allow list`, no client-delegated query trust).

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return `PERMISSION_DENIED`)

1. **Shadow Update (Ghost Field Injection on Supplier Create/Update):**
   `{ "id": "sup-1", "businessId": "biz-1", "ownerId": "uid-1", "name": "Test", "isVerified": true, "role": "admin" }` -> Rejected by `hasOnly(...)` and `affectedKeys().hasOnly(...)`.
2. **Email Spoofing (Unverified Admin Email):**
   Auth token `{ "email": "festusginah25@gmail.com", "email_verified": false }` attempting admin read/write -> Rejected by `request.auth.token.email_verified == true`.
3. **PII Blanket Read Attack:**
   Authenticated user `uid-2` attempting `get /users/uid-1/private/info` -> Rejected because `request.auth.uid != userId` and not admin.
4. **Cross-Tenant List Scraping Attack:**
   Authenticated user `uid-2` executing unfiltered `list /businesses` or `list /businesses/biz-1/suppliers` -> Rejected by `resource.data.ownerId == request.auth.uid`.
5. **Identity Spoofing (Forged `ownerId`):**
   User `uid-2` creating `/businesses/biz-2` with `{ "ownerId": "uid-1", ... }` -> Rejected because `incoming().ownerId == request.auth.uid` fails.
6. **Orphaned Subcollection Write:**
   User creating `/businesses/non-existent-biz/suppliers/sup-9` -> Rejected by parent `exists()` / `get()` Master Gate check.
7. **ID Poisoning / Resource Exhaustion:**
   Creating `/businesses/<1500-char-invalid-id!@#>` -> Rejected by `isValidId(businessId)`.
8. **Value Poisoning on Allowed Update Field:**
   Updating `outstandingBalance` to a string `"unlimited"` or negative number `-500` or `name` to a 5000-char string -> Rejected because `isValidSupplier(incoming())` wraps every update.
9. **State Shortcutting / Terminal State Tampering:**
   Non-admin attempting to update an already-archived supplier (`existing().status == 'archived'`) back to `'active'` -> Rejected by terminal lock `existing().status != 'archived'`.
10. **Temporal Integrity Spoofing (Backdated Timestamp):**
    Creating a business with client-forged `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> Rejected by `incoming().createdAt == request.time`.
11. **Privilege Escalation (Client Writing `/admins/{uid}`):**
    Signed-in user writing `{ "uid": "uid-2", "role": "admin" }` to `/admins/uid-2` -> Rejected by explicit `allow write: if false;`.
12. **Unbounded Array / Type Injection on `payments`:**
    Writing a supplier with `payments: ["not-a-map"]` or `payments.size() == 51` -> Rejected by Total Array Guarding (`payments is list && payments.size() <= 50 && (payments.size() == 0 || payments[0] is map)`).
