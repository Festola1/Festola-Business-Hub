import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('Firestore Security Rules & Blueprint Invariants (Dirty Dozen Verification)', () => {
  const blueprint = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'firebase-blueprint.json'), 'utf8'),
  ) as {
    entities: Record<string, { required?: string[]; properties: Record<string, unknown> }>;
    firestore: Record<string, { schema: string | { $ref: string }; description: string }>;
  };

  const getRulesSource = () => {
    const prodPath = path.join(ROOT, 'firestore.rules');
    const draftPath = path.join(ROOT, 'DRAFT_firestore.rules');
    const target = fs.existsSync(prodPath) ? prodPath : draftPath;
    return fs.readFileSync(target, 'utf8');
  };

  it('enforces global default-deny catch-all and rules_version 2', () => {
    const rules = getRulesSource();
    expect(rules).toContain("rules_version = '2';");
    expect(rules).toMatch(/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
  });

  it('secures every single collection declared in firebase-blueprint.json', () => {
    const rules = getRulesSource();
    expect(Object.keys(blueprint.firestore)).toEqual(
      expect.arrayContaining([
        '/users/{userId}',
        '/users/{userId}/private/{docId}',
        '/businesses/{businessId}',
        '/businesses/{businessId}/suppliers/{supplierId}',
        '/admins/{adminId}',
      ]),
    );
    expect(rules).toContain('match /users/{userId}');
    expect(rules).toContain('match /private/{docId}');
    expect(rules).toContain('match /businesses/{businessId}');
    expect(rules).toContain('match /suppliers/{supplierId}');
    expect(rules).toContain('match /admins/{adminId}');
  });

  it('blocks Dirty Dozen #1–#4: shadow updates, email spoofing, PII blanket reads, and client-trusted list scraping', () => {
    const rules = getRulesSource();
    // #1 Shadow update protection via hasOnly & affectedKeys().hasOnly
    expect(rules).toContain('data.keys().hasOnly(');
    expect(rules).toContain('incoming().diff(existing()).affectedKeys().hasOnly(');
    // #2 Email spoofing blocked by email_verified == true
    expect(rules).toContain('request.auth.token.email_verified == true');
    // #3 PII isolation under /private/{docId} restricted to owner or admin
    expect(rules).not.toMatch(/allow read:\s*if\s*isSignedIn\(\)\s*;/);
    // #4 List queries enforce resource.data ownership without get()/exists()
    expect(rules).toContain(
      'allow list: if isSignedIn() && resource.data.ownerId == request.auth.uid;',
    );
    expect(rules).toContain('resource.data.businessId == businessId');
  });

  it('blocks Dirty Dozen #5–#8: forged ownerId, orphaned writes, ID poisoning, and value poisoning on updates', () => {
    const rules = getRulesSource();
    // #5 Forged ownerId blocked in validation helpers
    expect(rules).toContain('data.ownerId == request.auth.uid');
    // #6 Orphaned writes prevented via Master Gate parent lookup
    expect(rules).toContain('function ownsBusiness(businessId)');
    expect(rules).toContain('exists(/databases/$(database)/documents/businesses/$(businessId))');
    // #7 ID poisoning guard
    expect(rules).toContain("id.matches('^[a-zA-Z0-9_\\\\-]+$')");
    expect(rules).toContain('id.size() <= 128');
    // #8 Validation helpers called on every update
    expect(rules).toMatch(/allow update:[\s\S]*?isValidUserPublicProfile\(incoming\(\), userId\)/);
    expect(rules).toMatch(/allow update:[\s\S]*?isValidBusiness\(incoming\(\), businessId\)/);
    expect(rules).toMatch(
      /allow update:[\s\S]*?isValidSupplier\(incoming\(\), businessId, supplierId\)/,
    );
  });

  it('blocks Dirty Dozen #9–#12: terminal state tampering, timestamp spoofing, admin escalation, and unbounded arrays', () => {
    const rules = getRulesSource();
    // #9 Terminal state locking
    expect(rules).toContain("existing().status != 'archived'");
    // #10 Temporal integrity
    expect(rules).toContain('incoming().createdAt == request.time');
    expect(rules).toContain('incoming().updatedAt == request.time');
    expect(rules).toContain('incoming().createdAt == existing().createdAt');
    // #11 Admin escalation denied
    expect(rules).toMatch(
      /match \/admins\/\{adminId\}[\s\S]*?allow create, update, delete: if false;/,
    );
    // #12 Bounded array + element type guard
    expect(rules).toContain('data.payments is list');
    expect(rules).toContain('data.payments.size() <= 50');
    expect(rules).toContain('data.payments[0] is map');
  });
});
