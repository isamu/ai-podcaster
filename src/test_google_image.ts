import dotenv from "dotenv";
dotenv.config();
// import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAuth } from 'google-auth-library';

// https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID; // Your Google Cloud Project ID
const GOOGLE_IMAGEN_MODEL='imagen-3.0-generate-001';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; // Your Vertex AI API Key
const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN; // Your Vertex AI API Key
const ENDPOINT = `https://us-central1-aiplatform.googleapis.com/v1/projects/${GOOGLE_PROJECT_ID}/locations/us-central1/publishers/google/models/${GOOGLE_IMAGEN_MODEL}:predict`;
const ENDPOINT_WITH_KEY = `https://us-central1-aiplatform.googleapis.com/v1/projects/${GOOGLE_PROJECT_ID}/locations/us-central1/publishers/google/models/${GOOGLE_IMAGEN_MODEL}:predict?key=${GOOGLE_API_KEY}`;

/*
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
*/

console.log("Project ID", GOOGLE_PROJECT_ID);
console.log("API Key", GOOGLE_API_KEY);
console.log("GOOGLE_ACCESS_TOKEN", GOOGLE_ACCESS_TOKEN);
// Function to generate an image from a text prompt
async function generateImage(prompt: string): Promise<string> {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
  
    // Get the access token
    const accessToken = await client.getAccessToken();
    console.log(accessToken.token);  
  
    // Prepare the payload for the API request
    const payload = {
      instances: [{
        prompt: prompt,
      }],
    };

    // Make the API call using fetch
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status} - ${response.statusText}`);
    }

    const responseData: any = await response.json();

    // Parse and return the generated image URL or data
    const predictions = responseData.predictions;
    if (predictions && predictions.length > 0) {
      console.log(predictions);
      return predictions[0].image; // Adjust based on the API response structure
    } else {
      throw new Error('No predictions returned from the API.');
    }
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
}

// Example usage
const main = async () => {
  /*
  const prompt0 = "Who is Satoshi Nakamoto?";
  const result = await model.generateContent([prompt0]);
  console.log(result.response.text());
  */

  const prompt = 'A futuristic city with flying cars and neon lights';

  try {
    const imageUrl = await generateImage(prompt);
    console.log('Generated Image URL:', imageUrl);
  } catch (error) {
    console.error('Failed to generate image:', error);
  }
}


main();
