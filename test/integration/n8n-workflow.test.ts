import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("n8n Telegram workflow template", () => {
  it("connects Telegram text input to the capture API and returns its message", async () => {
    const workflow = JSON.parse(
      await readFile(new URL("../../integrations/n8n/telegram-expense-workflow.json", import.meta.url), "utf8")
    ) as { nodes: Array<{ name: string; type: string; parameters: Record<string, unknown> }> };

    expect(workflow.nodes.map((node) => node.type)).toEqual(
      expect.arrayContaining([
        "n8n-nodes-base.telegramTrigger",
        "n8n-nodes-base.httpRequest",
        "n8n-nodes-base.telegram"
      ])
    );
    const request = workflow.nodes.find((node) => node.name === "Capture expense");
    expect(request?.parameters).toMatchObject({
      method: "POST",
      url: "={{ $env.FINANCE_API_URL + '/v1/captures' }}"
    });
  });
});
