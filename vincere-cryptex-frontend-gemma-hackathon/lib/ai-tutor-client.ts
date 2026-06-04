const AI_TUTOR_ASK_PATH = "/api/ai-tutor/ask";

export function askAiTutor(payload: unknown) {
  return fetch(AI_TUTOR_ASK_PATH, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
