/**
 * Master data lives in Lovable Cloud:
 *   customers / suppliers / team_members / products
 *
 * No auth yet — single shared workspace, public read/write.
 *
 * This hook is the single source of truth for reference data. It exposes:
 *   - Live arrays (synced via realtime + initial fetch)
 *   - add/update/delete for each entity
 *   - usage counts cross-referenced against `usePipelineStore.projects`
 *   - meta-options (TBD/Various/Unassigned for suppliers, "Custom (free text)" for products)
 *
 * Suppliers carry a `legacy_id` so existing project records that reference
 * `sup-freedom`, `sup-admax`, etc. keep working. Resolve a supplier by id
 * with `getSupplierByAnyId(idOrLegacyId)`.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePipelineStore } from "@/hooks/usePipelineStore";
import type { ShippingMode } from "@/data/pipelines";

// ─── Entity shapes ────────────────────────────────────────────────────────
export type CustomerCountry = "Local" | "Regional";
export type CustomerIncoterms = "FOB" | "CIF" | "LDP" | "LDF";

export interface Customer {
  id: string;
  name: string;
  country: CustomerCountry;
  incoterms?: CustomerIncoterms | null;
  // Legacy fields retained for now; not surfaced in the new UI.
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  default_shipping_mode?: ShippingMode | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Buyer {
  id: string;
  customer_id: string;
  name: string;
  email?: string | null;
  contact?: string | null;
  created_at: string;
  updated_at: string;
}
export interface SupplierRecord {
  id: string;
  name: string;
  country?: string | null;
  default_shipping_mode?: ShippingMode | null;
  notes?: string | null;
  legacy_id?: string | null;
  created_at: string;
  updated_at: string;
}
export interface TeamMember {
  id: string;
  initials: string;
  full_name: string;
  role?: "Sales" | "Production" | "Finance" | "Admin" | "Mixed" | "Design" | "Other" | string | null;
  email?: string | null;
  created_at: string;
  updated_at: string;
}
export interface ProductRecord {
  id: string;
  name: string;
  default_unit?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type EntityKind = "customer" | "supplier" | "team" | "product";

// Sales-rep multi-select on a project is a string[] of initials.
// We parse legacy `pointPerson` strings ("AV" or "TS, CB") into arrays.
export function parseInitials(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw.split(/[,\s/]+/).map((s) => s.trim()).filter(Boolean);
}
export function formatInitials(arr: string[]): string {
  return arr.join(", ");
}

interface Ctx {
  customers: Customer[];
  suppliers: SupplierRecord[];
  teamMembers: TeamMember[];
  products: ProductRecord[];
  buyers: Buyer[];
  loading: boolean;

  // Resolve a supplier by either its UUID id or its legacy "sup-…" id.
  getSupplierByAnyId: (id?: string | null) => SupplierRecord | undefined;
  // Resolve a team member by initials (case-insensitive).
  getTeamByInitials: (initials: string) => TeamMember | undefined;
  // Buyers belonging to a given customer.
  buyersByCustomer: (customerId: string) => Buyer[];

  // Usage counts (live projects, excluding trashed).
  customerUsage: (name: string) => number;
  supplierUsage: (id: string, legacyId?: string | null) => number;
  teamUsage: (initials: string) => number;
  productUsage: (name: string) => number;

  // CRUD
  addCustomer: (input: Partial<Customer> & { name: string }) => Promise<Customer>;
  updateCustomer: (id: string, patch: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;

  addSupplier: (input: Partial<SupplierRecord> & { name: string }) => Promise<SupplierRecord>;
  updateSupplier: (id: string, patch: Partial<SupplierRecord>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;

  addTeamMember: (input: { initials: string; full_name: string; role?: TeamMember["role"]; email?: string }) => Promise<TeamMember>;
  updateTeamMember: (id: string, patch: Partial<TeamMember>) => Promise<void>;
  deleteTeamMember: (id: string) => Promise<void>;

  addProduct: (input: { name: string; default_unit?: string; notes?: string }) => Promise<ProductRecord>;
  updateProduct: (id: string, patch: Partial<ProductRecord>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  addBuyer: (customerId: string, input: { name: string; email?: string | null; contact?: string | null }) => Promise<Buyer>;
  updateBuyer: (id: string, patch: Partial<Pick<Buyer, "name" | "email" | "contact">>) => Promise<void>;
  deleteBuyer: (id: string) => Promise<void>;
}

const MasterDataCtx = createContext<Ctx | null>(null);

export const MasterDataProvider = ({ children }: { children: ReactNode }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch + realtime
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [c, s, t, p] = await Promise.all([
        supabase.from("customers").select("*").order("name"),
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("team_members").select("*").order("initials"),
        supabase.from("products").select("*").order("name"),
      ]);
      if (!mounted) return;
      if (c.data) setCustomers(c.data as Customer[]);
      if (s.data) setSuppliers(s.data as SupplierRecord[]);
      if (t.data) setTeamMembers(t.data as TeamMember[]);
      if (p.data) setProducts(p.data as ProductRecord[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("master-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, async () => {
        const { data } = await supabase.from("customers").select("*").order("name");
        if (data) setCustomers(data as Customer[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers" }, async () => {
        const { data } = await supabase.from("suppliers").select("*").order("name");
        if (data) setSuppliers(data as SupplierRecord[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, async () => {
        const { data } = await supabase.from("team_members").select("*").order("initials");
        if (data) setTeamMembers(data as TeamMember[]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, async () => {
        const { data } = await supabase.from("products").select("*").order("name");
        if (data) setProducts(data as ProductRecord[]);
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // ─── Lookups ────────────────────────────────────────────────────────────
  const supplierByAnyId = useMemo(() => {
    const m = new Map<string, SupplierRecord>();
    for (const s of suppliers) {
      m.set(s.id, s);
      if (s.legacy_id) m.set(s.legacy_id, s);
    }
    return m;
  }, [suppliers]);
  const getSupplierByAnyId = useCallback(
    (id?: string | null) => (id ? supplierByAnyId.get(id) : undefined),
    [supplierByAnyId],
  );

  const teamByInitials = useMemo(() => {
    const m = new Map<string, TeamMember>();
    for (const t of teamMembers) m.set(t.initials.toUpperCase(), t);
    return m;
  }, [teamMembers]);
  const getTeamByInitials = useCallback(
    (init: string) => teamByInitials.get(init.toUpperCase()),
    [teamByInitials],
  );

  // ─── Usage counts (cross-referenced against in-memory projects) ─────────
  const store = usePipelineStore();
  const projects = store.projects;

  const customerUsage = useCallback(
    (name: string) => projects.filter((p) => p.customer === name).length,
    [projects],
  );
  const supplierUsage = useCallback(
    (id: string, legacyId?: string | null) =>
      projects.filter((p) => p.supplierId === id || (legacyId && p.supplierId === legacyId)).length,
    [projects],
  );
  const teamUsage = useCallback(
    (initials: string) => {
      const I = initials.toUpperCase();
      return projects.filter((p) => parseInitials(p.pointPerson).map((s) => s.toUpperCase()).includes(I)).length;
    },
    [projects],
  );
  const productUsage = useCallback(
    (name: string) =>
      projects.reduce(
        (n, p) => n + (p.lineItems?.filter((li) => li.description === name).length ?? 0),
        0,
      ),
    [projects],
  );

  // ─── CRUD ───────────────────────────────────────────────────────────────
  const addCustomer = useCallback(async (input: Partial<Customer> & { name: string }) => {
    const { data, error } = await supabase
      .from("customers")
      .insert({ ...input })
      .select()
      .single();
    if (error) throw error;
    setCustomers((prev) => [...prev.filter((c) => c.id !== data.id), data as Customer].sort((a, b) => a.name.localeCompare(b.name)));
    return data as Customer;
  }, []);
  const updateCustomer = useCallback(async (id: string, patch: Partial<Customer>) => {
    const { error } = await supabase.from("customers").update(patch).eq("id", id);
    if (error) throw error;
  }, []);
  const deleteCustomer = useCallback(async (id: string) => {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) throw error;
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addSupplier = useCallback(async (input: Partial<SupplierRecord> & { name: string }) => {
    const { data, error } = await supabase.from("suppliers").insert({ ...input }).select().single();
    if (error) throw error;
    setSuppliers((prev) => [...prev.filter((s) => s.id !== data.id), data as SupplierRecord].sort((a, b) => a.name.localeCompare(b.name)));
    return data as SupplierRecord;
  }, []);
  const updateSupplier = useCallback(async (id: string, patch: Partial<SupplierRecord>) => {
    const { error } = await supabase.from("suppliers").update(patch).eq("id", id);
    if (error) throw error;
  }, []);
  const deleteSupplier = useCallback(async (id: string) => {
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) throw error;
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addTeamMember = useCallback(async (input: { initials: string; full_name: string; role?: TeamMember["role"]; email?: string }) => {
    const { data, error } = await supabase
      .from("team_members")
      .insert({ ...input, initials: input.initials.toUpperCase() })
      .select().single();
    if (error) throw error;
    setTeamMembers((prev) => [...prev.filter((t) => t.id !== data.id), data as TeamMember].sort((a, b) => a.initials.localeCompare(b.initials)));
    return data as TeamMember;
  }, []);
  const updateTeamMember = useCallback(async (id: string, patch: Partial<TeamMember>) => {
    const p = patch.initials ? { ...patch, initials: patch.initials.toUpperCase() } : patch;
    const { error } = await supabase.from("team_members").update(p).eq("id", id);
    if (error) throw error;
  }, []);
  const deleteTeamMember = useCallback(async (id: string) => {
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) throw error;
    setTeamMembers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addProduct = useCallback(async (input: { name: string; default_unit?: string; notes?: string }) => {
    const { data, error } = await supabase.from("products").insert({ ...input }).select().single();
    if (error) throw error;
    setProducts((prev) => [...prev.filter((p) => p.id !== data.id), data as ProductRecord].sort((a, b) => a.name.localeCompare(b.name)));
    return data as ProductRecord;
  }, []);
  const updateProduct = useCallback(async (id: string, patch: Partial<ProductRecord>) => {
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) throw error;
  }, []);
  const deleteProduct = useCallback(async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const value = useMemo<Ctx>(() => ({
    customers, suppliers, teamMembers, products, loading,
    getSupplierByAnyId, getTeamByInitials,
    customerUsage, supplierUsage, teamUsage, productUsage,
    addCustomer, updateCustomer, deleteCustomer,
    addSupplier, updateSupplier, deleteSupplier,
    addTeamMember, updateTeamMember, deleteTeamMember,
    addProduct, updateProduct, deleteProduct,
  }), [
    customers, suppliers, teamMembers, products, loading,
    getSupplierByAnyId, getTeamByInitials,
    customerUsage, supplierUsage, teamUsage, productUsage,
    addCustomer, updateCustomer, deleteCustomer,
    addSupplier, updateSupplier, deleteSupplier,
    addTeamMember, updateTeamMember, deleteTeamMember,
    addProduct, updateProduct, deleteProduct,
  ]);

  return <MasterDataCtx.Provider value={value}>{children}</MasterDataCtx.Provider>;
};

export const useMasterData = () => {
  const ctx = useContext(MasterDataCtx);
  if (!ctx) throw new Error("useMasterData must be used inside MasterDataProvider");
  return ctx;
};
