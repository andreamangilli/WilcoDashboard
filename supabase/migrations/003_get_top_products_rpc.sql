-- supabase/migrations/003_get_top_products_rpc.sql

-- Partial index for get_top_products RPC (paid orders by date)
CREATE INDEX IF NOT EXISTS idx_shopify_orders_paid_date
  ON shopify_orders(created_at DESC)
  WHERE financial_status = 'paid';

CREATE OR REPLACE FUNCTION get_top_products(
  p_start timestamptz,
  p_end   timestamptz,
  p_limit int DEFAULT 5
)
RETURNS TABLE(title text, units bigint, revenue numeric, store_name text)
LANGUAGE sql STABLE AS $$
  SELECT
    li->>'title'                                              AS title,
    SUM((li->>'quantity')::int)                              AS units,
    SUM((li->>'quantity')::int * (li->>'price')::numeric)    AS revenue,
    s.name                                                    AS store_name
  FROM shopify_orders o
  JOIN stores s ON s.id = o.store_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE jsonb_typeof(o.line_items) WHEN 'array' THEN o.line_items ELSE '[]'::jsonb END
  ) AS li
  WHERE o.created_at BETWEEN p_start AND p_end
    AND o.financial_status = 'paid'
    AND li->>'title' IS NOT NULL
    AND li->>'price' ~ '^[0-9]+(\.[0-9]+)?$'
  GROUP BY li->>'title', s.name
  ORDER BY revenue DESC
  LIMIT p_limit;
$$;
