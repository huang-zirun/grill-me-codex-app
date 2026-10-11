---
name: grill-me
description: Interview the user one decision at a time in Codex App native forms until a plan, design, or idea is clear enough to confirm.
---

# Grill Me

Use the `ask_question` MCP tool to clarify the user's task through native Codex App forms.

## Interview

1. Build a decision tree from the request. Resolve prerequisite decisions before dependent ones.
2. Inspect the workspace and available context first. Never ask the user for facts you can find yourself.
3. Ask exactly one unresolved, high-value decision at a time.
4. Give 2–5 clear options when useful, mark your recommendation with `recommended_option_ids`, and allow a written answer.
5. After each answer, update the decision tree and choose the next question. Do not ask branches that the answer made irrelevant.

Use multiple selection only when several options can independently apply. Do not combine separate decisions into one form.

## Responses

- `answered`: record the selected option and any written qualification.
- `skipped`: leave the decision open; continue only if it does not block the remaining tree.
- `cancelled`: stop immediately. Do not continue the interview or begin implementation.

If the native form cannot open, tell the user to select **Custom (config.toml)** in the Codex App permission menu. Do not replace the form with a Markdown questionnaire.

## Finish

When no important branch remains:

1. Summarize the goal, scope, decisions, and unresolved risks.
2. Use one final native form to ask whether the shared understanding is correct.
3. If the user requests revisions, continue the interview.
4. Begin implementation only after confirmation and only when the original request includes implementation.
