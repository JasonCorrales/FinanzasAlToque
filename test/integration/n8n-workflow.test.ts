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

async function loadWorkflow(
  filename = "telegram-expense-workflow.json"
): Promise<Workflow> {
  return JSON.parse(
    await readFile(new URL(`../../integrations/n8n/${filename}`, import.meta.url), "utf8")
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

  it.each([
    ["self-hosted", "telegram-expense-workflow.json", "$env"],
    ["n8n Cloud", "telegram-expense-workflow-cloud.json", "$vars"]
  ])(
    "routes each Telegram update type through one trigger in the %s template",
    async (_runtime, filename, variables) => {
      const workflow = await loadWorkflow(filename);
      const triggers = workflow.nodes.filter((node) => node.type === "n8n-nodes-base.telegramTrigger");
      const router = workflow.nodes.find((node) => node.name === "Route Telegram update");
      const decision = workflow.nodes.find((node) => node.name === "Apply decision");

      expect(triggers).toHaveLength(1);
      expect(triggers[0]).toMatchObject({
        name: "Telegram update",
        parameters: { updates: ["message", "callback_query"] }
      });
      expect(router?.type).toBe("n8n-nodes-base.if");
      expect(router?.parameters).toMatchObject({
        conditions: {
          conditions: [
            {
              leftValue: "={{ $json.callback_query !== undefined }}",
              rightValue: true
            }
          ]
        }
      });
      expect(workflow.connections["Telegram update"]?.main[0]?.[0]?.node).toBe(
        "Route Telegram update"
      );
      expect(workflow.connections["Route Telegram update"]?.main[0]?.[0]?.node).toBe(
        "Apply decision"
      );
      expect(workflow.connections["Route Telegram update"]?.main[1]?.[0]?.node).toBe(
        "Capture expense"
      );
      expect(decision?.parameters).toMatchObject({
        method: "POST",
        url: `={{ ${variables}.FINANCE_API_URL + '/v1/transactions/' + $json.callback_query.data.split(':')[1] + '/decision' }}`
      });
      expect(workflow.nodes.find((node) => node.name === "Explain pending")?.parameters).toHaveProperty(
        "replyMarkup",
        "inlineKeyboard"
      );
    }
  );

  it("provides an n8n Cloud template configured through custom variables", async () => {
    const workflow = await loadWorkflow("telegram-expense-workflow-cloud.json");
    const capture = workflow.nodes.find((node) => node.name === "Capture expense");
    const decision = workflow.nodes.find((node) => node.name === "Apply decision");

    expect(capture?.parameters).toMatchObject({
      url: "={{ $vars.FINANCE_API_URL + '/v1/captures' }}",
      jsonBody:
        "={{ { workspaceId: $vars.FINANCE_WORKSPACE_ID, externalMessageId: String($json.message.message_id), channel: 'telegram', message: $json.message.text } }}"
    });
    expect(decision?.parameters).toMatchObject({
      url: "={{ $vars.FINANCE_API_URL + '/v1/transactions/' + $json.callback_query.data.split(':')[1] + '/decision' }}",
      jsonBody:
        "={{ { workspaceId: $vars.FINANCE_WORKSPACE_ID, action: $json.callback_query.data.split(':')[0] } }}"
    });
  });

  it.each([
    ["self-hosted", "telegram-expense-workflow.json"],
    ["n8n Cloud", "telegram-expense-workflow-cloud.json"]
  ])(
    "relays API validation messages and reserves the generic error for transport failures in %s",
    async (_runtime, filename) => {
      const workflow = await loadWorkflow(filename);
      const capture = workflow.nodes.find((node) => node.name === "Capture expense");
      const decision = workflow.nodes.find((node) => node.name === "Apply decision");

      expect(capture?.parameters).toMatchObject({
        options: { response: { response: { neverError: true, responseFormat: "json" } } }
      });
      expect(decision?.parameters).toMatchObject({
        options: { response: { response: { neverError: true, responseFormat: "json" } } }
      });
      expect(capture?.onError).toBe("continueErrorOutput");
      expect(decision?.onError).toBe("continueErrorOutput");
      expect(workflow.connections["Capture expense"]?.main[1]?.[0]?.node).toBe("Explain error");
      expect(workflow.connections["Apply decision"]?.main[1]?.[0]?.node).toBe("Explain error");
      expect(workflow.nodes.find((node) => node.name === "Explain outcome")?.parameters).toMatchObject({
        text: "={{ $json.message }}"
      });
      expect(workflow.nodes.find((node) => node.name === "Explain decision")?.parameters).toMatchObject({
        text: "={{ $json.message }}"
      });
    }
  );
});
