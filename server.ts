import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.post('/api/ai/tuner', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in Secrets. All manual controller settings remain available.',
      });
      return;
    }

    const { prompt, mode, currentSettings } = req.body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'Please provide a playstyle or game prompt.' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const isDeep = mode === 'deep';
    const model = isDeep ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite';

    try {
      const response = await ai.models.generateContent({
        model,
        contents: `User playstyle request: "${prompt.trim()}"\nCurrent controller settings summary: ${JSON.stringify(
          currentSettings ?? {},
        )}`,
        config: {
          ...(isDeep
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } }
            : {}),
          systemInstruction:
            'You are a mobile FPS & DualSense ergonomics specialist optimizing a touchscreen controller on an Android smartphone (Realme C51). Keep summary concise (2-3 sentences). Return valid JSON matching the schema with practical sensitivity, deadzone, and trigger/face button suggestions.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'Concise 2-3 sentence tuning explanation.',
              },
              recommendedPatch: {
                type: Type.OBJECT,
                properties: {
                  sticks: {
                    type: Type.OBJECT,
                    properties: {
                      leftSensitivity: { type: Type.NUMBER },
                      leftDeadzone: { type: Type.NUMBER },
                      rightSensitivity: { type: Type.NUMBER },
                      rightDeadzone: { type: Type.NUMBER },
                    },
                  },
                  gyro: {
                    type: Type.OBJECT,
                    properties: {
                      enabled: { type: Type.BOOLEAN },
                      sensitivity: { type: Type.NUMBER },
                      deadzone: { type: Type.NUMBER },
                    },
                  },
                },
              },
            },
            required: ['summary'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gemini tuning request failed.';
      res.status(502).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Phantom Controller server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
