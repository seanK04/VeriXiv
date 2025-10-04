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

      // Search papers by text query
      if (path === '/api/search' && method === 'POST') {
        return await handleSearch(request, env, corsHeaders);
      }

      // Find similar papers by paper ID
      if (path === '/api/similar' && method === 'POST') {
        return await handleSimilar(request, env, corsHeaders);
      }

      // Upsert papers to Vectorize
      if (path === '/api/upsert' && method === 'POST') {
        return await handleUpsert(request, env, corsHeaders);
      }

      // Get paper by ID
      if (path === '/api/paper' && method === 'GET') {
        return await handleGetPaper(request, env, corsHeaders);
      }

      // Default response
      return new Response('VeriXiv Worker - Available endpoints: /api/health, /api/embed, /api/search, /api/similar, /api/upsert, /api/paper', { 
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

// Handle text-based search
async function handleSearch(request, env, corsHeaders) {
  try {
    const { query, topK = 10 } = await request.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ 
        error: 'Query parameter is required and must be a string' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate embedding for the query
    const aiResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [query]
    });

    if (!aiResponse || !aiResponse.data || !Array.isArray(aiResponse.data)) {
      return new Response(JSON.stringify({ 
        error: 'Failed to generate query embedding' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const queryVector = aiResponse.data[0];

    // Search in Vectorize
    const vectorizeResponse = await env.VEC.query(
      Float32Array.from(queryVector),
      { 
        topK: Math.min(topK, 50), // Cap at 50 results
        returnValues: false,
        returnMetadata: true
      }
    );

    if (!vectorizeResponse || !vectorizeResponse.matches) {
      return new Response(JSON.stringify({ 
        error: 'Vector search failed' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Format results
    const results = vectorizeResponse.matches.map(match => ({
      id: match.id,
      title: match.metadata?.title || '',
      authors: match.metadata?.authors || [],
      categories: match.metadata?.categories || [],
      published: match.metadata?.published || '',
      similarity_score: match.score,
      abstract: match.metadata?.abstract ? 
        match.metadata.abstract.substring(0, 200) + '...' : ''
    }));

    return new Response(JSON.stringify({
      query,
      results,
      total: results.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({ 
      error: 'Search failed',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle finding similar papers by paper ID
async function handleSimilar(request, env, corsHeaders) {
  try {
    const { paperId, topK = 10 } = await request.json();

    if (!paperId) {
      return new Response(JSON.stringify({ 
        error: 'Paper ID is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get the paper's vector from Vectorize
    const paperResponse = await env.VEC.getByIds([paperId]);

    if (!paperResponse || !paperResponse.matches || paperResponse.matches.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'Paper not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const paperVector = paperResponse.matches[0].values;

    // Find similar papers
    const similarResponse = await env.VEC.query(
      Float32Array.from(paperVector),
      { 
        topK: Math.min(topK + 1, 51), // +1 to exclude the paper itself
        returnValues: false,
        returnMetadata: true
      }
    );

    if (!similarResponse || !similarResponse.matches) {
      return new Response(JSON.stringify({ 
        error: 'Similarity search failed' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Filter out the paper itself and format results
    const results = similarResponse.matches
      .filter(match => match.id !== paperId)
      .slice(0, topK)
      .map(match => ({
        id: match.id,
        title: match.metadata?.title || '',
        authors: match.metadata?.authors || [],
        categories: match.metadata?.categories || [],
        published: match.metadata?.published || '',
        similarity_score: match.score,
        abstract: match.metadata?.abstract ? 
          match.metadata.abstract.substring(0, 200) + '...' : ''
      }));

    return new Response(JSON.stringify({
      paper_id: paperId,
      similar_papers: results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Similar papers error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to find similar papers',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle upserting papers to Vectorize
async function handleUpsert(request, env, corsHeaders) {
  try {
    const { papers } = await request.json();

    if (!papers || !Array.isArray(papers)) {
      return new Response(JSON.stringify({ 
        error: 'Papers array is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Process papers and generate embeddings
    const vectors = [];
    
    for (const paper of papers) {
      if (!paper.id || !paper.title || !paper.abstract) {
        console.warn('Skipping paper with missing required fields:', paper.id);
        continue;
      }

      // Combine title and abstract for embedding
      const textToEmbed = `${paper.title}\n\n${paper.abstract}`;
      
      try {
        // Generate embedding
        const aiResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: [textToEmbed]
        });

        if (aiResponse && aiResponse.data && aiResponse.data[0]) {
          vectors.push({
            id: paper.id,
            vector: Float32Array.from(aiResponse.data[0]),
            metadata: {
              title: paper.title,
              abstract: paper.abstract,
              authors: paper.authors || [],
              categories: paper.categories || [],
              published: paper.published || '',
              updated: paper.updated || paper.published || '',
              pdf_url: paper.pdf_url || ''
            }
          });
        }
      } catch (embedError) {
        console.error('Failed to embed paper:', paper.id, embedError);
        continue;
      }
    }

    if (vectors.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No valid papers to upsert' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Upsert to Vectorize
    await env.VEC.upsert(vectors);

    return new Response(JSON.stringify({
      success: true,
      upserted: vectors.length,
      total_requested: papers.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Upsert error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to upsert papers',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle getting paper by ID
async function handleGetPaper(request, env, corsHeaders) {
  try {
    const url = new URL(request.url);
    const paperId = url.searchParams.get('id');

    if (!paperId) {
      return new Response(JSON.stringify({ 
        error: 'Paper ID parameter is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get paper from Vectorize
    const response = await env.VEC.getByIds([paperId]);

    if (!response || !response.matches || response.matches.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'Paper not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const match = response.matches[0];
    const paper = {
      id: match.id,
      title: match.metadata?.title || '',
      abstract: match.metadata?.abstract || '',
      authors: match.metadata?.authors || [],
      categories: match.metadata?.categories || [],
      published: match.metadata?.published || '',
      updated: match.metadata?.updated || '',
      pdf_url: match.metadata?.pdf_url || `https://arxiv.org/pdf/${paperId.replace('arxiv:', '')}.pdf`,
      has_embedding: !!match.values
    };

    return new Response(JSON.stringify(paper), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Get paper error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to get paper',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
