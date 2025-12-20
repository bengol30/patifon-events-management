import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OpenAI API key is missing in environment variables");
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const prompt = `
    You are a helpful assistant that formats WhatsApp messages for an event management system.
    Your task is to take the following Hebrew text and format it to look professional and engaging for a WhatsApp group message.
    
    Rules:
    1. Add **bold** (using asterisks like *text*) to important words, names, dates, and times.
    2. Add relevant emojis to the beginning of lines or where appropriate to make the message lively.
    3. Keep the tone professional but friendly.
    4. Do NOT change the meaning of the text.
    5. Do NOT add a preamble or postscript. Just return the formatted text.
    6. Do NOT include links if they were removed from the input. The input text should be the message content without the raw links.
    7. Ensure the text is properly aligned for RTL (Hebrew).
    8. Be creative with emojis! Use different ones each time if appropriate.

    Input Text:
    "${text}"
    `;

    let model = "gpt-4o";
    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a creative and helpful assistant for formatting WhatsApp messages in Hebrew." },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      // Try fallback to gpt-3.5-turbo if 4o fails (e.g. 404 model not found or 429 rate limit)
      console.warn(`Failed with ${model}, trying gpt-3.5-turbo...`);
      model = "gpt-3.5-turbo";
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are a creative and helpful assistant for formatting WhatsApp messages in Hebrew." },
            { role: "user", content: prompt }
          ],
          temperature: 0.8,
        }),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      // Return the actual error to the client for debugging
      return NextResponse.json({ error: `OpenAI Error: ${errorText}` }, { status: 500 });
    }

    const data = await response.json();
    const formatted = data.choices[0]?.message?.content?.trim() || text;

    return NextResponse.json({ formatted });
  } catch (error) {
    console.error("Error in AI format API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
