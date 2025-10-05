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

      // Analyze paper reproducibility with similarity comparison
      if (path === '/api/analyze' && method === 'POST') {
        return await handleAnalyze(request, env, corsHeaders);
      }

      // Full pipeline orchestrator - coordinates everything
      if (path === '/api/analyze-full-pipeline' && method === 'POST') {
        return await handleFullPipeline(request, env, corsHeaders);
      }

      // Default response
      return new Response('VeriXiv Worker - Available endpoints: /api/health, /api/embed, /api/search, /api/similar, /api/upsert, /api/paper, /api/analyze, /api/analyze-full-pipeline', { 
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

// Handle paper analysis with similarity comparison
async function handleAnalyze(request, env, corsHeaders) {
  try {
    const { text, topK = 5 } = await request.json();

    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ 
        error: 'Text parameter is required and must be a string' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Starting analysis for text: "${text.substring(0, 100)}..."`);

    // Step 1: Generate embedding for the input text
    const aiResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [text]
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
    console.log(`Generated embedding with ${queryVector.length} dimensions`);

    // Step 2: Find similar papers in Vectorize
    const vectorizeResponse = await env.VEC.query(
      Float32Array.from(queryVector),
      { 
        topK: Math.min(topK, 20), // Cap at 20 results
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

    console.log(`Found ${vectorizeResponse.matches.length} similar papers`);

    // Step 3: Extract similar papers with metadata and PDF URLs
    const similarPapers = vectorizeResponse.matches.map(match => ({
      id: match.id,
      title: match.metadata?.title || '',
      authors: match.metadata?.authors || [],
      categories: match.metadata?.categories || [],
      published: match.metadata?.published || '',
      similarity_score: match.score,
      abstract: match.metadata?.abstract || '',
      pdf_url: match.metadata?.pdf_url || `https://arxiv.org/pdf/${match.id.replace('arxiv:', '')}.pdf`
    }));

    if (similarPapers.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No similar papers found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 4: Return papers with PDF URLs ready for Flask analysis
    return new Response(JSON.stringify({
      success: true,
      input_text: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
      similar_papers_found: similarPapers.length,
      similar_papers: similarPapers,
      analysis_ready: {
        top_papers_for_analysis: similarPapers.slice(0, Math.min(topK, 5)),
        flask_integration: {
          endpoint: '/score',
          method: 'POST',
          sample_request: {
            paper_id: similarPapers[0].id.replace('arxiv:', ''),
            pdf_url: similarPapers[0].pdf_url  // Use PDF URL from Vectorize metadata
          }
        }
      },
      search_timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return new Response(JSON.stringify({ 
      error: 'Analysis failed',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Full pipeline orchestrator - combines all services
async function handleFullPipeline(request, env, corsHeaders) {
  try {
    const { paper_id, paper_text, k = 5 } = await request.json();
    
    if (!paper_id && !paper_text) {
      return new Response(JSON.stringify({ 
        error: 'Either paper_id or paper_text is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`Starting full pipeline analysis for paper: ${paper_id || 'uploaded PDF'}`);
    
    // STEP 1: Extract paper text (if arXiv paper)
    let extractedText = paper_text;
    
    if (paper_id && !paper_text) {
      console.log('Calling Flask to extract paper text...');
      
      const extractResponse = await fetch(`${env.FLASK_API_URL}/process-arxiv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper_id })
      });
      
      if (!extractResponse.ok) {
        const errorData = await extractResponse.json();
        return new Response(JSON.stringify({ 
          error: 'Failed to extract paper text',
          details: errorData.error
        }), {
          status: extractResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const extractData = await extractResponse.json();
      extractedText = extractData.text || '';
    }
    
    // Take first 400 words for embedding (token limit consideration)
    const paperExcerpt = extractedText.split(/\s+/).slice(0, 400).join(' ');
    
    if (!paperExcerpt) {
      return new Response(JSON.stringify({ 
        error: 'No text extracted from paper' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // STEP 2: Find similar papers using existing logic
    console.log('Finding similar papers in Vectorize...');
    const similarPapers = await findSimilarPapers(paperExcerpt, k, env);
    
    if (similarPapers.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No similar papers found in database',
        suggestion: 'Try with a different paper or increase k value'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`Found ${similarPapers.length} similar papers`);
    
    // STEP 3: Score each similar paper via Flask
    console.log('Scoring papers with Gemini...');
    const scoringPromises = similarPapers.map(async (paper) => {
      try {
        const scoreResponse = await fetch(`${env.FLASK_API_URL}/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paper_id: paper.id.replace('arxiv:', ''),
            pdf_url: paper.pdf_url
          })
        });
        
        if (!scoreResponse.ok) {
          console.warn(`Failed to score paper ${paper.id}: ${scoreResponse.status}`);
          return null;
        }
        
        const scoreData = await scoreResponse.json();
        
        return {
          ...paper,
          rubric_score: scoreData.graded_rubric_score || 0,
          rubric_details: scoreData.graded_rubric || {},
          assessment: scoreData.graded_rubric?.Assessment || 'No assessment available'
        };
      } catch (error) {
        console.error(`Error scoring paper ${paper.id}:`, error.message);
        return null;
      }
    });
    
    // Execute all scoring in parallel
    const scoredPapers = (await Promise.all(scoringPromises)).filter(p => p !== null);
    
    if (scoredPapers.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'Failed to score any papers',
        details: 'All scoring requests failed. Check Flask service availability.'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`Successfully scored ${scoredPapers.length} papers`);
    
    // STEP 4: Return aggregated results
    return new Response(JSON.stringify({
      success: true,
      analyzed_paper_id: paper_id || 'uploaded',
      similar_papers: scoredPapers.map(p => ({
        id: p.id,
        title: p.title,
        authors: p.authors,
        similarity_score: p.similarity_score,
        reproducibility_score: Math.round(p.rubric_score * 100), // Convert to 0-100
        data_available: p.rubric_details?.['Data Download'] !== 'Not Present',
        code_available: p.rubric_details?.['Link to Code'] !== 'Not Present',
        rubric_breakdown: p.rubric_details,
        assessment: p.assessment,
        abstract: p.abstract
      })),
      total_analyzed: scoredPapers.length,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Full pipeline error:', error);
    return new Response(JSON.stringify({ 
      error: 'Pipeline failed',
      message: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Helper function to find similar papers (reuses existing logic)
async function findSimilarPapers(text, topK, env) {
  try {
    // Generate embedding using Workers AI
    const aiResponse = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [text]
    });
    
    if (!aiResponse || !aiResponse.data || !Array.isArray(aiResponse.data)) {
      throw new Error('Failed to generate embedding');
    }
    
    const queryVector = aiResponse.data[0];
    
    // Search in Vectorize
    const vectorizeResponse = await env.VEC.query(
      Float32Array.from(queryVector),
      { 
        topK: Math.min(topK, 20), // Cap at 20 results
        returnValues: false,
        returnMetadata: true
      }
    );
    
    if (!vectorizeResponse || !vectorizeResponse.matches) {
      throw new Error('Vector search failed');
    }
    
    // Format and return results
    return vectorizeResponse.matches.map(match => ({
      id: match.id,
      title: match.metadata?.title || 'Untitled',
      authors: match.metadata?.authors || [],
      categories: match.metadata?.categories || [],
      published: match.metadata?.published || '',
      similarity_score: match.score,
      abstract: match.metadata?.abstract || '',
      pdf_url: match.metadata?.pdf_url || `https://arxiv.org/pdf/${match.id.replace('arxiv:', '')}.pdf`
    }));
  } catch (error) {
    console.error('Error finding similar papers:', error);
    throw error;
  }
}
