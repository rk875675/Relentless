import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";
import { getUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "GET") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const supabase = createServiceClient();
  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  // Deferred until lesson seed data exists. Set ONBOARDING_SAMPLE_LESSON_ID
  // to the UUID of the designated sample lesson before O1 goes live.
  const sampleLessonId = Deno.env.get("ONBOARDING_SAMPLE_LESSON_ID");
  if (!sampleLessonId) {
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Sample lesson not configured",
      requestId,
    );
  }

  const { data: lesson, error } = await supabase
    .from("lessons")
    .select(
      "id, coach_id, title, duration_seconds, lesson_type, voiceover_url, on_screen_text, reflection_prompt, sort_order",
    )
    .eq("id", sampleLessonId)
    .single();

  if (error || !lesson) {
    return errorResponse(404, "NOT_FOUND", "Sample lesson not found", requestId);
  }

  const { data: categories } = await supabase
    .from("lesson_categories")
    .select("category")
    .eq("lesson_id", sampleLessonId);

  return successResponse(
    {
      ...lesson,
      categories: (categories ?? []).map(
        (c: { category: string }) => c.category,
      ),
    },
    requestId,
  );
});
