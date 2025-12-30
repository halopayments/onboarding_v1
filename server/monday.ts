type MondayCreateParams = {
  appId: string;
  businessName: string;
  ownerName: string;
  createdAtISO: string;
};

export async function createMondayItem(p: MondayCreateParams): Promise<void> {
  const token = process.env.MONDAY_API_TOKEN;
  const boardId = process.env.MONDAY_BOARD_ID;

  if (!token || !boardId) {
    console.warn("[monday] missing MONDAY_API_TOKEN or MONDAY_BOARD_ID, skipping");
    return;
  }

  const query = `
    mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
        id
      }
    }
  `;

  // IMPORTANT: your board columns must match these keys.
  // Update keys to your real column ids, e.g. "text", "date", etc.
  const columnValues = {
    // Example column IDs — replace with your actual Monday column IDs:
    app_id: p.appId,
    business: p.businessName,
    owner: p.ownerName,
    created_at: p.createdAtISO
  };

  const itemName = `${p.businessName || "Merchant"} - ${p.appId}`;

  const resp = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token
    },
    body: JSON.stringify({
      query,
      variables: {
        boardId,
        itemName,
        columnValues: JSON.stringify(columnValues)
      }
    })
  });

  const json = await resp.json();

  if (!resp.ok) {
    console.error("[monday] http error:", resp.status, json);
    throw new Error(`Monday HTTP ${resp.status}`);
  }

  if (json.errors?.length) {
    console.error("[monday] graphql errors:", json.errors);
    throw new Error(json.errors[0]?.message || "Monday GraphQL error");
  }

  console.log("[monday] item created:", json.data?.create_item?.id);
}
