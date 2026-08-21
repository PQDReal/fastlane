"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Database,
  Edit3,
  FileCheck2,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AdminModalPortal } from "@/components/admin/admin-modal-portal";
import { Button } from "@/components/ui/button";
import { ToastViewport, type ToastMessage } from "@/components/ui/toast";
import { formatAfterSalesMeasurement } from "@/lib/after-sales-display-value";

type Fact = {
  fact_id: string;
  primary_source_id: string;
  service_type: string;
  vehicle_type: string;
  model: string | null;
  subject: string;
  fact_type: string;
  value_numeric: number | string;
  value_text: string | null;
  unit: string;
  confidence: number | string;
  approval_status: string;
  publication_status: string;
  release_id: string | null;
  updated_at: string;
};

type Source = {
  source_id: string;
  title: string | null;
  source_url: string;
  service_type: string;
  vehicle_type: string;
  availability: string | null;
};
type FormState = Omit<
  Fact,
  | "fact_id"
  | "approval_status"
  | "publication_status"
  | "release_id"
  | "updated_at"
>;

const EMPTY_FORM: FormState = {
  primary_source_id: "",
  service_type: "maintenance",
  vehicle_type: "car",
  model: "",
  subject: "",
  fact_type: "",
  value_numeric: 0,
  value_text: "",
  unit: "km",
  confidence: 1,
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  warranty: "Bảo hành",
  maintenance: "Bảo dưỡng",
  repair: "Sửa chữa",
  rescue: "Cứu hộ",
};

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  car: "Ô tô",
  motorbike: "Xe máy điện",
  bus: "Xe buýt",
  all: "Tất cả phương tiện",
};

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Đã từ chối",
};

async function readError(response: Response) {
  try {
    const body = await response.json();
    return body.error || "Có lỗi xảy ra.";
  } catch {
    return "Có lỗi xảy ra.";
  }
}

export function AfterSalesManager() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [release, setRelease] = useState<{
    release_id: string;
    published_at: string;
    counts: Record<string, unknown>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("pending");
  const [editing, setEditing] = useState<Fact | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback(
    (kind: ToastMessage["kind"], title: string, message?: string) => {
      const id = Date.now() + Math.random();
      setToasts((items) => [...items, { id, kind, title, message }]);
      window.setTimeout(
        () => setToasts((items) => items.filter((item) => item.id !== id)),
        4500,
      );
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/admin/after-sales?status=${encodeURIComponent(status)}&search=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readError(response));
      const body = await response.json();
      setFacts(body.data?.facts ?? []);
      setSources(body.data?.sources ?? []);
      setRelease(body.data?.publishedRelease ?? null);
    } catch (error) {
      notify(
        "error",
        "Không thể tải dữ liệu hậu mãi",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setLoading(false);
    }
  }, [notify, query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const sourceOptions = useMemo(
    () => sources.filter((source) => source.availability !== "unavailable"),
    [sources],
  );
  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      primary_source_id: sourceOptions[0]?.source_id ?? "",
    });
    setOpen(true);
  };
  const openEdit = (fact: Fact) => {
    setEditing(fact);
    setForm({
      primary_source_id: fact.primary_source_id,
      service_type: fact.service_type,
      vehicle_type: fact.vehicle_type,
      model: fact.model ?? "",
      subject: fact.subject,
      fact_type: fact.fact_type,
      value_numeric: fact.value_numeric,
      value_text: fact.value_text ?? "",
      unit: fact.unit,
      confidence: fact.confidence,
    });
    setOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(
        editing
          ? `/api/v1/admin/after-sales/${editing.fact_id}`
          : "/api/v1/admin/after-sales",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      setOpen(false);
      await load();
      notify(
        "success",
        editing ? "Đã cập nhật fact nháp" : "Đã tạo fact nháp",
        "Fact chỉ hiển thị trên frontend sau khi được duyệt và phát hành qua release.",
      );
    } catch (error) {
      notify(
        "error",
        "Lưu fact thất bại",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = (fact: Fact) => {
    const toastId = Date.now() + Math.random();
    setToasts((items) => [
      ...items,
      {
        id: toastId,
        kind: "warning",
        title: "Xác nhận loại fact nháp?",
        message: `Fact ${fact.fact_type} của ${fact.model || "tất cả mẫu xe"} sẽ chuyển sang trạng thái bị từ chối.`,
        secondaryAction: {
          label: "Hủy",
          onClick: () =>
            setToasts((items) => items.filter((item) => item.id !== toastId)),
        },
        action: {
          label: "Loại fact",
          variant: "danger",
          onClick: () => {
            setToasts((items) => items.filter((item) => item.id !== toastId));
            void (async () => {
              const response = await fetch(
                `/api/v1/admin/after-sales/${fact.fact_id}`,
                { method: "DELETE" },
              );
              if (!response.ok)
                notify(
                  "error",
                  "Không thể loại fact",
                  await readError(response),
                );
              else {
                await load();
                notify("success", "Đã loại fact nháp");
              }
            })();
          },
        },
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <ToastViewport
        toasts={toasts}
        onClose={(id) =>
          setToasts((items) => items.filter((item) => item.id !== id))
        }
      />
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">
            Admin · Dịch vụ hậu mãi
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            CMS dịch vụ hậu mãi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            CRUD fact nháp trong database; frontend công khai chỉ đọc release đã
            được duyệt.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-slate-900 text-white hover:bg-slate-800"
        >
          <Plus size={16} className="mr-2" /> Tạo fact nháp
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="border border-slate-200 bg-white p-5">
          <Database className="text-brand-600" size={20} />
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">
            Fact đang xem
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {facts.length}
          </p>
        </div>
        <div className="border border-slate-200 bg-white p-5">
          <FileCheck2 className="text-emerald-600" size={20} />
          <p className="mt-3 text-xs uppercase tracking-wider text-slate-500">
            Release đã phát hành
          </p>
          <p className="mt-1 truncate text-sm font-bold text-slate-900">
            {release?.release_id ?? "Chưa có"}
          </p>
        </div>
        <div className="border border-slate-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Nguồn database
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {sources.length} nguồn trong manifest
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Frontend và CMS dùng cùng Supabase read model.
          </p>
        </div>
      </section>

      <section className="overflow-hidden border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-80">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm mẫu xe, chủ đề, loại fact..."
              className="w-full border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="pending">Chờ duyệt / bản nháp</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Đã từ chối</option>
            <option value="all">Tất cả</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Fact</th>
                <th className="px-5 py-3">Dịch vụ / xe</th>
                <th className="px-5 py-3">Giá trị</th>
                <th className="px-5 py-3">Trạng thái</th>
                <th className="px-5 py-3">Cập nhật</th>
                <th className="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <Loader2 className="mx-auto animate-spin text-slate-400" />
                  </td>
                </tr>
              )}
              {!loading &&
                facts.map((fact) => (
                  <tr
                    key={fact.fact_id}
                    className="transition hover:bg-slate-50 active:bg-slate-100"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {fact.fact_type}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {fact.subject} · {fact.model || "tất cả mẫu xe"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {SERVICE_TYPE_LABELS[fact.service_type] ??
                        fact.service_type}{" "}
                      ·{" "}
                      {VEHICLE_TYPE_LABELS[fact.vehicle_type] ??
                        fact.vehicle_type}
                    </td>
                    <td className="px-5 py-4 font-semibold text-brand-700">
                      {formatAfterSalesMeasurement({
                        valueText: fact.value_text,
                        valueNumeric: fact.value_numeric,
                        unit: fact.unit,
                      })}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {APPROVAL_STATUS_LABELS[fact.approval_status] ??
                          fact.approval_status}
                      </span>
                      {fact.release_id && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          Đã khóa theo release
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {new Date(fact.updated_at).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          title="Sửa fact"
                          disabled={
                            Boolean(fact.release_id) ||
                            fact.approval_status !== "pending"
                          }
                          onClick={() => openEdit(fact)}
                          className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          title="Loại fact nháp"
                          disabled={
                            Boolean(fact.release_id) ||
                            fact.approval_status !== "pending"
                          }
                          onClick={() => remove(fact)}
                          className="rounded-md p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && facts.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-slate-500"
                  >
                    Không có fact phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AdminModalPortal>
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={() => !saving && setOpen(false)}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="after-sales-fact-dialog-title"
                className="max-h-[90vh] w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-2xl"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="mb-5 flex items-center justify-between">
                  <h2
                    id="after-sales-fact-dialog-title"
                    className="text-lg font-bold text-slate-900"
                  >
                    {editing ? "Sửa fact nháp" : "Tạo fact nháp"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => !saving && setOpen(false)}
                    className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Đóng"
                  >
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      Source manifest
                      <select
                        required
                        value={form.primary_source_id}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            primary_source_id: event.target.value,
                          })
                        }
                        className="mt-1 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm"
                      >
                        <option value="">-- Chọn nguồn --</option>
                        {sourceOptions.map((source) => (
                          <option
                            key={source.source_id}
                            value={source.source_id}
                          >
                            {source.title || source.source_id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Loại fact
                      <input
                        required
                        value={form.fact_type}
                        onChange={(event) =>
                          setForm({ ...form, fact_type: event.target.value })
                        }
                        className="mt-1 w-full border border-slate-300 px-3 py-2.5 text-sm"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Loại dịch vụ
                      <select
                        value={form.service_type}
                        onChange={(event) =>
                          setForm({ ...form, service_type: event.target.value })
                        }
                        className="mt-1 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm"
                      >
                        <option value="warranty">Bảo hành</option>
                        <option value="maintenance">Bảo dưỡng</option>
                        <option value="repair">Sửa chữa</option>
                        <option value="rescue">Cứu hộ</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Loại phương tiện
                      <select
                        value={form.vehicle_type}
                        onChange={(event) =>
                          setForm({ ...form, vehicle_type: event.target.value })
                        }
                        className="mt-1 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm"
                      >
                        <option value="car">Ô tô</option>
                        <option value="motorbike">Xe máy điện</option>
                        <option value="bus">Xe buýt</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Mẫu xe
                      <input
                        value={form.model ?? ""}
                        onChange={(event) =>
                          setForm({ ...form, model: event.target.value })
                        }
                        className="mt-1 w-full border border-slate-300 px-3 py-2.5 text-sm"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Chủ đề
                      <input
                        required
                        value={form.subject}
                        onChange={(event) =>
                          setForm({ ...form, subject: event.target.value })
                        }
                        className="mt-1 w-full border border-slate-300 px-3 py-2.5 text-sm"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Giá trị số
                      <input
                        required
                        type="number"
                        step="any"
                        value={form.value_numeric}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            value_numeric: event.target.value,
                          })
                        }
                        className="mt-1 w-full border border-slate-300 px-3 py-2.5 text-sm"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Đơn vị
                      <input
                        required
                        value={form.unit}
                        onChange={(event) =>
                          setForm({ ...form, unit: event.target.value })
                        }
                        className="mt-1 w-full border border-slate-300 px-3 py-2.5 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block text-sm font-medium text-slate-700">
                    Giá trị văn bản
                    <input
                      value={form.value_text ?? ""}
                      onChange={(event) =>
                        setForm({ ...form, value_text: event.target.value })
                      }
                      className="mt-1 w-full border border-slate-300 px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Độ tin cậy (0–1)
                    <input
                      required
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={form.confidence}
                      onChange={(event) =>
                        setForm({ ...form, confidence: event.target.value })
                      }
                      className="mt-1 w-full border border-slate-300 px-3 py-2.5 text-sm"
                    />
                  </label>
                  <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                      disabled={saving}
                    >
                      <X size={15} className="mr-2" /> Hủy
                    </Button>
                    <Button
                      type="submit"
                      disabled={saving || sourceOptions.length === 0}
                      className="bg-slate-900 text-white hover:bg-slate-800"
                    >
                      {saving && (
                        <Loader2 size={15} className="mr-2 animate-spin" />
                      )}{" "}
                      Lưu bản nháp
                    </Button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </AdminModalPortal>
    </div>
  );
}
