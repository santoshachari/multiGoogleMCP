import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function runTests() {
    const transport = new StdioClientTransport({
        command: "node",
        args: ["./build/index.js"],
    });

    const client = new Client(
        {
            name: "test-client",
            version: "1.0.0",
        },
        {
            capabilities: {},
        }
    );

    await client.connect(transport);

    console.log("Connected. Testing list accounts...");
    try {
        const listRes = await client.callTool({
            name: "gmail_list_accounts"
        });
        console.log(listRes.content[0].text);
    } catch (e: any) {
        console.error("List Accounts failed:", e.message);
    }

    console.log("\nTesting search emails for hi@santo.sh...");
    try {
        const searchRes = await client.callTool({
            name: "gmail_search",
            arguments: {
                email: "hi@santo.sh",
                query: "is:unread",
                maxResults: 2
            }
        });
        console.log(searchRes.content[0].text);
    } catch (e: any) {
        console.error("Search failed:", e.message);
    }

    console.log("\nTesting drafting email for santoshsmart86@gmail.com...");
    try {
        const draftRes = await client.callTool({
            name: "gmail_draft",
            arguments: {
                email: "santoshsmart86@gmail.com",
                to: "hi@santo.sh",
                subject: "MCP Test Draft",
                body: "This is a test draft created by the MCP server!"
            }
        });
        console.log(draftRes.content[0].text);
    } catch (e: any) {
        console.error("Draft failed:", e.message);
    }

    console.log("\nTesting sending email from santoshsmart86@gmail.com (should fail because draftonly)...");
    try {
        const sendRes = await client.callTool({
            name: "gmail_send",
            arguments: {
                email: "santoshsmart86@gmail.com",
                to: "hi@santo.sh",
                subject: "MCP Test Send",
                body: "This is a test send created by the MCP server!"
            }
        });
        console.log(sendRes.content[0].text);
    } catch (e: any) {
        console.error("Send failed as expected. Error:", e.message);
    }

    process.exit(0);
}

runTests().catch(console.error);
