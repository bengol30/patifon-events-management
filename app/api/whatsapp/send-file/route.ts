import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            method = "base64", // base64, upload, or url
            chatId,
            file, // base64 string for base64 method
            fileName,
            urlFile, // URL for url method
            caption,
            idInstance,
            apiTokenInstance,
        } = body;

        if (!chatId || !idInstance || !apiTokenInstance) {
            return NextResponse.json(
                { error: "Missing required parameters: chatId, idInstance, apiTokenInstance" },
                { status: 400 }
            );
        }

        const baseApi = "https://api.green-api.com";
        let endpoint = "";
        let requestBody: any = { chatId };

        if (method === "base64") {
            if (!file || !fileName) {
                return NextResponse.json(
                    { error: "Missing file or fileName for base64 method" },
                    { status: 400 }
                );
            }
            endpoint = `${baseApi}/waInstance${idInstance}/SendFileByBase64/${apiTokenInstance}`;
            requestBody = {
                chatId,
                file,
                fileName,
                ...(caption ? { caption } : {}),
            };
        } else if (method === "url") {
            if (!urlFile) {
                return NextResponse.json(
                    { error: "Missing urlFile for url method" },
                    { status: 400 }
                );
            }
            endpoint = `${baseApi}/waInstance${idInstance}/SendFileByUrl/${apiTokenInstance}`;
            requestBody = {
                chatId,
                urlFile,
                fileName: fileName || "file",
                ...(caption ? { caption } : {}),
            };
        } else {
            return NextResponse.json(
                { error: "Unsupported method. Use 'base64' or 'url'" },
                { status: 400 }
            );
        }

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        const responseText = await response.text();

        if (!response.ok) {
            console.error("Green API error:", responseText);
            return NextResponse.json(
                { error: responseText || "Failed to send file" },
                { status: response.status }
            );
        }

        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = { message: responseText };
        }

        return NextResponse.json(responseData);
    } catch (error: any) {
        console.error("Error in send-file API:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
