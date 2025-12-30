/**
 * Model Defaults and Inference
 *
 * Provides smart defaults for Letta SDK v1.0+ required fields
 * based on model and embedding strings.
 */

export interface LLMDefaults {
  model_endpoint_type: string;
  context_window: number;
}

export interface EmbeddingDefaults {
  embedding_endpoint_type: string;
  embedding_dim: number;
}

/**
 * Infer LLM configuration defaults from model string
 */
export function inferLLMDefaults(modelString: string): LLMDefaults {
  const lower = modelString.toLowerCase();

  // Check for common model patterns
  if (lower.includes('gpt-4') || lower.includes('gpt-3.5')) {
    return {
      model_endpoint_type: 'openai',
      context_window: lower.includes('gpt-4-turbo') || lower.includes('gpt-4o') ? 128000 : 8192
    };
  }

  if (lower.includes('claude')) {
    // Check for specific Claude models
    if (lower.includes('opus')) {
      return {
        model_endpoint_type: 'openai', // Using OpenAI compatibility layer
        context_window: 200000
      };
    }
    if (lower.includes('sonnet')) {
      return {
        model_endpoint_type: 'openai',
        context_window: 200000
      };
    }
    if (lower.includes('haiku')) {
      return {
        model_endpoint_type: 'openai',
        context_window: 200000
      };
    }
    // Default Claude
    return {
      model_endpoint_type: 'openai',
      context_window: 200000
    };
  }

  if (lower.includes('gemini')) {
    return {
      model_endpoint_type: 'google_ai',
      context_window: 32768
    };
  }

  if (lower.includes('llama')) {
    return {
      model_endpoint_type: 'ollama',
      context_window: 8192
    };
  }

  // Default fallback
  return {
    model_endpoint_type: 'openai',
    context_window: 8192
  };
}

/**
 * Infer embedding configuration defaults from embedding model string
 */
export function inferEmbeddingDefaults(embeddingString: string): EmbeddingDefaults {
  const lower = embeddingString.toLowerCase();

  // Letta's free embedding service
  if (lower.includes('letta') && lower.includes('free')) {
    return {
      embedding_endpoint_type: 'openai',
      embedding_dim: 1024
    };
  }

  // OpenAI embeddings
  if (lower.includes('text-embedding-3-large')) {
    return {
      embedding_endpoint_type: 'openai',
      embedding_dim: 3072
    };
  }

  if (lower.includes('text-embedding-3-small') || lower.includes('text-embedding-ada')) {
    return {
      embedding_endpoint_type: 'openai',
      embedding_dim: 1536
    };
  }

  // Hugging Face embeddings
  if (lower.includes('sentence-transformers') || lower.includes('all-minilm')) {
    return {
      embedding_endpoint_type: 'hugging-face',
      embedding_dim: 384
    };
  }

  // Default fallback
  return {
    embedding_endpoint_type: 'openai',
    embedding_dim: 1536
  };
}

/**
 * Apply defaults to config, using user overrides if provided
 */
export interface ModelConfig {
  model: string;
  model_endpoint_type?: string;
  context_window?: number;
}

export interface EmbeddingConfig {
  embedding: string;
  embedding_endpoint_type?: string;
  embedding_dim?: number;
}

export function applyLLMDefaults(config: ModelConfig): Required<ModelConfig> {
  const defaults = inferLLMDefaults(config.model);
  return {
    model: config.model,
    model_endpoint_type: config.model_endpoint_type ?? defaults.model_endpoint_type,
    context_window: config.context_window ?? defaults.context_window
  };
}

export function applyEmbeddingDefaults(config: EmbeddingConfig): Required<EmbeddingConfig> {
  const defaults = inferEmbeddingDefaults(config.embedding);
  return {
    embedding: config.embedding,
    embedding_endpoint_type: config.embedding_endpoint_type ?? defaults.embedding_endpoint_type,
    embedding_dim: config.embedding_dim ?? defaults.embedding_dim
  };
}
