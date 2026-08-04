const PAST_STAY = {
  start_date: "2000-01-01",
  end_date: "2000-01-02",
  party_size: 1,
};

export async function verifyPersistentToolSession(client, expected, options = {}) {
  const liveStart = addUtcDays(30);
  const liveEnd = addUtcDays(37);
  const sequence = options.live
    ? [
        {
          name: "search_parks",
          arguments: { query: "Jasper" },
          expect: /Jasper[\s\S]*campground id:/i,
        },
        {
          name: "search_park_availability",
          arguments: {
            query: "Jasper",
            start_date: liveStart,
            end_date: liveEnd,
            nights: 2,
            party_size: 1,
            equipment_type: "tent",
            category: "campsite",
          },
          expect: /equipment types|campground|open|availability/i,
        },
        {
          name: "search_sites",
          arguments: {
            campground_id: "-2147483597",
            start_date: liveStart,
            end_date: liveEnd,
            nights: 2,
            party_size: 1,
            equipment_type: "tent",
          },
          expect: /equipment types|site|open|availability/i,
        },
      ]
    : [
        {
          name: "resolve_dates",
          arguments: { month: 7, day: 17, year: 2099, nights: 2 },
          expect: /2099-07-17[\s\S]*2099-07-19/,
        },
        {
          name: "search_park_availability",
          arguments: { query: "Jasper", ...PAST_STAY },
          expect: /past/i,
        },
        {
          name: "search_sites",
          arguments: { campground_id: "-2147483597", ...PAST_STAY },
          expect: /past/i,
        },
      ];

  await assertToolSet(client, expected, "initial discovery");
  for (const call of sequence) {
    const result = await client.callTool(
      { name: call.name, arguments: call.arguments },
      undefined,
      { timeout: 120_000 },
    );
    if (result.isError) {
      throw new Error(`${call.name} returned an MCP error: ${toolText(result)}`);
    }
    const output = toolText(result);
    if (!call.expect.test(output)) {
      throw new Error(`${call.name} returned unexpected output: ${output.slice(0, 500)}`);
    }
    await assertToolSet(client, expected, `after ${call.name}`);
  }
}

async function assertToolSet(client, expected, phase) {
  const actual = (await client.listTools()).tools.map((tool) => tool.name).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(
      `Tool mismatch ${phase}.\nExpected: ${wanted.join(", ")}\nActual: ${actual.join(", ")}`,
    );
  }
}

function toolText(result) {
  return (result.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n");
}

function addUtcDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
