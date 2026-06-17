// What this file does:
// Takes an array of documents (with base64 image data or text content)
// Sends each document to Claude with a prompt asking it to extract key fields
// Returns structured JSON with the extracted information

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic.Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Build a type-specific prompt telling Claude exactly which JSON fields to extract
function buildExtractionPrompt(docType) {
  if (docType === 'PRESCRIPTION') {
    return `You are extracting information from an Indian medical prescription.

Extract and return ONLY a JSON object with these fields (use null if not found):
{
  "patient_name": "",
  "doctor_name": "",
  "doctor_registration": "",
  "date": "",
  "diagnosis": "",
  "medicines": [],
  "tests_ordered": [],
  "hospital_name": ""
}

Return ONLY the JSON. No explanation.`;
  }

  if (docType === 'HOSPITAL_BILL') {
    return `You are extracting information from an Indian hospital bill or clinic invoice.

Extract and return ONLY a JSON object with these fields (use null if not found):
{
  "patient_name": "",
  "hospital_name": "",
  "date": "",
  "bill_number": "",
  "line_items": [{ "description": "", "amount": 0 }],
  "total": 0,
  "gstin": ""
}

Return ONLY the JSON. No explanation.`;
  }

  if (docType === 'LAB_REPORT') {
    return `You are extracting information from an Indian medical lab report.

Extract and return ONLY a JSON object with these fields (use null if not found):
{
  "patient_name": "",
  "lab_name": "",
  "referring_doctor": "",
  "sample_date": "",
  "report_date": "",
  "tests": [{ "name": "", "result": "", "unit": "", "normal_range": "" }],
  "remarks": ""
}

Return ONLY the JSON. No explanation.`;
  }

  if (docType === 'PHARMACY_BILL') {
    return `You are extracting information from an Indian pharmacy bill.

Extract and return ONLY a JSON object with these fields (use null if not found):
{
  "patient_name": "",
  "pharmacy_name": "",
  "date": "",
  "doctor_name": "",
  "medicines": [{ "name": "", "quantity": 0, "amount": 0 }],
  "total": 0,
  "discount": 0,
  "net_amount": 0
}

Return ONLY the JSON. No explanation.`;
  }

  // Fallback prompt for unknown document types
  return `You are extracting information from a medical document.

Extract and return ONLY a JSON object with any relevant fields you can find.
Return ONLY the JSON. No explanation.`;
}

// Parse Claude's text response into a JSON object
function parseClaudeResponse(responseText) {
  // Claude sometimes wraps JSON in markdown code fences — strip those first
  let cleanedText = responseText.trim();

  if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(cleanedText);
}

// Send one document image to Claude Vision and extract structured fields
async function extractWithClaude(document) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: document.mimeType,
              data: document.base64Data,
            },
          },
          {
            type: 'text',
            text: buildExtractionPrompt(document.actual_type),
          },
        ],
      },
    ],
  });

  const responseText = response.content[0].text;

  try {
    const extracted = parseClaudeResponse(responseText);
    return {
      extracted,
      source: 'claude_vision',
    };
  } catch (parseError) {
    return {
      extracted: { parse_error: true, raw_response: responseText },
      source: 'parse_error',
    };
  }
}

// Main entry point — parse all documents in a claim
async function parseDocuments(documents) {
  try {
    const parsedDocuments = [];

    for (const document of documents) {
      // Test case mode: content is already provided, skip the Claude API call
      if (document.content) {
        parsedDocuments.push({
          file_id: document.file_id,
          actual_type: document.actual_type,
          extracted: document.content,
          source: 'test_case_content',
        });
        continue;
      }

      // Real upload mode: send the image to Claude Vision
      if (document.base64Data) {
        const result = await extractWithClaude(document);
        parsedDocuments.push({
          file_id: document.file_id,
          actual_type: document.actual_type,
          extracted: result.extracted,
          source: result.source,
        });
        continue;
      }

      // No content and no image — nothing to parse
      parsedDocuments.push({
        file_id: document.file_id,
        actual_type: document.actual_type,
        extracted: null,
        source: 'no_data',
      });
    }

    return {
      agent: 'docParser',
      passed: true,
      documents: parsedDocuments,
    };
  } catch (error) {
    console.error('[docParser] Error parsing documents:', error.message);
    throw error;
  }
}

module.exports = { parseDocuments, buildExtractionPrompt };
