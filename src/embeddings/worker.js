export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Health check endpoint
      if (path === '/api/health' && method === 'GET') {
        return new Response(JSON.stringify({ 
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            ai: 'available',
            vectorize: 'available'
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Embed text endpoint
      if (path === '/api/embed' && method === 'POST') {
        return await handleEmbed(request, env, corsHeaders);
      }

      // Default response
      return new Response('VeriXiv Worker - Use /api/health or /api/embed', { 
        status: 404, 
        headers: corsHeaders 
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal Server Error',
        message: error.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Handle text embedding
async function handleEmbed(request, env, corsHeaders) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ 
        error: 'Text parameter is required and must be a string' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate embedding using Workers AI
    const aiResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [text]
    });

    if (!aiResponse || !aiResponse.data || !Array.isArray(aiResponse.data)) {
      return new Response(JSON.stringify({ 
        error: 'Failed to generate embedding' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const embedding = aiResponse.data[0];

    return new Response(JSON.stringify({
      success: true,
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      embedding: embedding,
      dimensions: embedding.length,
      model: '@cf/baai/bge-base-en-v1.5'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Embedding error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to generate embedding',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
