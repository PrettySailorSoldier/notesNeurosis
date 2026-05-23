import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

export const claude = {
  async complete({ messages }: { messages: { role: string; content: string }[] }) {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: messages as any,
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  },
};
