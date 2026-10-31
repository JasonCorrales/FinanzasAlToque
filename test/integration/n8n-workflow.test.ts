import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface WorkflowNode {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  onError?: string;
}

interface Workflow {
  nodes: WorkflowNode[];
  connections: Record<string, { main: Array<Array<{ node: string }>> }>;
}

async function loadWorkflow(): Promise<Workflow> {
  return JSON.parse(
    await readFile(
      new URL("../../integrations/n8n/telegram-expense-workflow.json", import.meta.url),
      "utf8"
    )
  ) as Workflow;
}

describe("n8n Telegram workflow template", () => {
  it("connects Telegram text input to the capture API and returns its message", async () => {
    const workflow = await loadWorkflow();
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

  it("sends confirm or cancel callbacks to the transaction decision endpoint", async () => {
    const workflow = await loadWorkflow();
    const decision = workflow.nodes.find((node) => node.name === "Apply decision");

    expect(decision?.parameters).toMatchObject({
      method: "POST",
      url: "={{ $env.FINANCE_API_URL + '/v1/transactions/' + $json.callback_query.data.split(':')[1] + '/decision' }}"
    });
    expect(workflow.nodes.find((node) => node.name === "Explain pending")?.parameters).toHaveProperty(
      "replyMarkup",
      "inlineKeyboard"
    );
  });

  it("routes capture and decision request errors back to Telegram", async () => {
    const workflow = await loadWorkflow();
    expect(workflow.nodes.find((node) => node.name === "Capture expense")?.onError).toBe(
      "continueErrorOutput"
    );
    expect(workflow.nodes.find((node) => node.name === "Apply decision")?.onError).toBe(
      "continueErrorOutput"
    );
    expect(workflow.connections["Capture expense"]?.main[1]?.[0]?.node).toBe("Explain error");
    expect(workflow.connections["Apply decision"]?.main[1]?.[0]?.node).toBe("Explain error");
  });
});
