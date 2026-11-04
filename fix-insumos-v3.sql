-- Clean It | Reparación de exclusiones por servicio v3
-- No eliminar funciones existentes ni tablas. Ejecutar completo en SQL Editor.
-- Conserva íntegramente pedidos, insumos, servicios y exclusiones anteriores.

CREATE OR REPLACE FUNCTION public.admin_get_service_material_exclusions_v3()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'No autorizado para leer la configuración de insumos' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('service_id', service_id, 'material_id', material_id))
    FROM public.service_material_exclusions), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_service_hidden_materials_v3(
  p_service_id uuid, p_hidden_material_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actual_ids uuid[];
DECLARE expected_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden configurar insumos' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id) THEN
    RAISE EXCEPTION 'Servicio inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_hidden_material_ids, '{}'::uuid[])) id
    WHERE NOT EXISTS (SELECT 1 FROM public.materials m WHERE m.id = id)
  ) THEN
    RAISE EXCEPTION 'Uno o más insumos ya no existen';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT id ORDER BY id), '{}'::uuid[])
  INTO expected_ids FROM unnest(COALESCE(p_hidden_material_ids, '{}'::uuid[])) id;

  DELETE FROM public.service_material_exclusions WHERE service_id = p_service_id;
  INSERT INTO public.service_material_exclusions(service_id, material_id)
  SELECT p_service_id, id FROM unnest(expected_ids) id;

  SELECT COALESCE(array_agg(material_id ORDER BY material_id), '{}'::uuid[])
  INTO actual_ids FROM public.service_material_exclusions WHERE service_id = p_service_id;
  IF actual_ids IS DISTINCT FROM expected_ids THEN
    RAISE EXCEPTION 'La base no confirmó la configuración solicitada';
  END IF;
  RETURN jsonb_build_object('service_id', p_service_id, 'hidden_material_ids', to_jsonb(actual_ids), 'saved', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_service_material_exclusions_v3() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_service_hidden_materials_v3(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_service_material_exclusions_v3() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_service_hidden_materials_v3(uuid, uuid[]) TO authenticated;

SELECT proname AS funcion, pg_get_function_result(p.oid) AS retorno
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('admin_get_service_material_exclusions_v3','admin_set_service_hidden_materials_v3');
