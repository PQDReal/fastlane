import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { authorizeAdminAfterSalesRequest } from "@/lib/auth/admin";
import { ApiAuthError, authErrorResponse } from "@/lib/auth/errors";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function authError(error: unknown) {
  if (error instanceof ApiAuthError) return authErrorResponse(error);
  throw error;
}

function parseMutationBody(body: Record<string, unknown>) {
  const valueNumeric = Number(body.value_numeric);
  const confidence = Number(body.confidence);
  const required = [
    "service_type",
    "vehicle_type",
    "subject",
    "fact_type",
    "unit",
    "primary_source_id",
  ];
  if (
    required.some(
      (key) => typeof body[key] !== "string" || !String(body[key]).trim(),
    )
  )
    throw new Error("Thiếu trường fact bắt buộc.");
  if (
    !Number.isFinite(valueNumeric) ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  )
    throw new Error("Giá trị số hoặc confidence không hợp lệ.");
  const text = (key: string, fallback: string | null = null) =>
    typeof body[key] === "string" && body[key].trim()
      ? body[key].trim()
      : fallback;
  return {
    primary_source_id: text("primary_source_id"),
    source_ids: [text("primary_source_id")],
    service_type: text("service_type"),
    vehicle_type: text("vehicle_type"),
    powertrain: text("powertrain", "all"),
    model: text("model"),
    subject: text("subject"),
    policy_entity: text("policy_entity", text("subject")),
    battery_chemistry: text("battery_chemistry", "not_applicable"),
    usage_condition: text("usage_condition", "standard_use"),
    applicability: text("applicability", "all"),
    action: text("action", "inspect"),
    fact_type: text("fact_type"),
    value_numeric: valueNumeric,
    value_text: text("value_text", String(body.value_numeric)),
    unit: text("unit"),
    qualifier: text("qualifier"),
    interval_relation: text("interval_relation"),
    interval_group_id: text("interval_group_id"),
    interval_group_distance_policy: text("interval_group_distance_policy"),
    distance_policy: text("distance_policy", "not_stated"),
    confidence,
    source_review_status: "admin_draft",
    review_reasons: ["admin_created_or_edited"],
    publication_status: "review_required",
    updated_at: new Date().toISOString(),
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ factId: string }> },
) {
  try {
    await authorizeAdminAfterSalesRequest(request);
  } catch (error) {
    return authError(error);
  }

  const { factId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json(
      { error: "Payload không hợp lệ." },
      { status: 400 },
    );

  const { data: existing, error: lookupError } = await getSupabaseAdmin()
    .from("after_sales_facts")
    .select("fact_id,approval_status,release_id")
    .eq("fact_id", factId)
    .maybeSingle();
  if (lookupError)
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!existing)
    return NextResponse.json(
      { error: "Không tìm thấy fact." },
      { status: 404 },
    );
  if (existing.approval_status !== "pending" || existing.release_id) {
    return NextResponse.json(
      {
        error:
          "Fact đã được xử lý hoặc đã thuộc release; hãy tạo bản chỉnh sửa mới.",
      },
      { status: 409 },
    );
  }

  try {
    const parsed = parseMutationBody(body as Record<string, unknown>);
    const { data, error } = await getSupabaseAdmin().rpc(
      "admin_after_sales_upsert_fact",
      {
        p_fact_id: factId,
        p_payload: parsed,
      },
    );
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Dữ liệu fact không hợp lệ.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ factId: string }> },
) {
  try {
    await authorizeAdminAfterSalesRequest(request);
  } catch (error) {
    return authError(error);
  }
  const { factId } = await context.params;
  const actor = await getCurrentUser();
  const { data, error } = await getSupabaseAdmin().rpc(
    "admin_after_sales_reject_fact",
    {
      p_fact_id: factId,
      p_reviewer_id: actor?.id ?? "admin-api",
    },
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data)
    return NextResponse.json(
      { error: "Fact đã được phát hành hoặc không tồn tại; không thể xóa." },
      { status: 409 },
    );
  return NextResponse.json({ data });
}
