"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { FieldEditor } from "./field-editor";
import { toast } from "sonner";
import type { CustomFieldDefinition, CustomFieldValue } from "@/types";

interface CardCustomFieldsProps {
  cardId: string;
  boardId: string;
  definitions: CustomFieldDefinition[];
}

export function CardCustomFields({
  cardId,
  boardId,
  definitions,
}: CardCustomFieldsProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/cards/${cardId}/custom-fields`);
        if (!res.ok) return;
        const data: CustomFieldValue[] = await res.json();
        const map: Record<string, unknown> = {};
        data.forEach((v) => {
          map[v.field_id] = v.value;
        });
        setValues(map);
      } finally {
        setLoaded(true);
      }
    }
    load();
  }, [cardId]);

  async function handleChange(fieldId: string, value: unknown) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    try {
      const res = await fetch(`/api/cards/${cardId}/custom-fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId, value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to save field");
    }
  }

  if (!loaded || definitions.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Custom Fields</p>
      {definitions.map((def) => (
        <div key={def.id} className="space-y-1.5">
          <Label className="text-sm">{def.name}</Label>
          <FieldEditor
            definition={def}
            value={values[def.id] ?? null}
            onChange={(v) => handleChange(def.id, v)}
          />
        </div>
      ))}
    </div>
  );
}
