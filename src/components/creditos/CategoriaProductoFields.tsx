import React from 'react';
import { Control, Controller, FieldErrors, FieldValues } from 'react-hook-form';
import { CategoriaProductoChipPicker } from './CategoriaProductoChipPicker';

type Props = {
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
  watch: (name: 'categoria_producto' | 'categoria_producto_otro') => string | undefined;
  setValue: (name: 'categoria_producto' | 'categoria_producto_otro', value: string) => void;
  label: string;
  hint?: string;
  otroPlaceholder?: string;
  otroInputLabel?: string;
};

export function CategoriaProductoFields({
  control,
  errors,
  watch,
  setValue,
  label,
  hint,
  otroPlaceholder = 'Ej: Muebles, Herramientas...',
  otroInputLabel = 'Nombre de categoría',
}: Props) {
  return (
    <Controller
      control={control}
      name="categoria_producto"
      render={({ field }) => (
        <CategoriaProductoChipPicker
          label={label}
          hint={hint}
          value={field.value ?? ''}
          categoriaOtro={watch('categoria_producto_otro') ?? ''}
          onSelect={(slug) => {
            field.onChange(slug);
            if (slug !== 'otro') setValue('categoria_producto_otro', '');
          }}
          onOtroChange={(text) => setValue('categoria_producto_otro', text)}
          otroInputLabel={otroInputLabel}
          otroPlaceholder={otroPlaceholder}
          errorCategoria={errors.categoria_producto?.message as string | undefined}
          errorOtro={errors.categoria_producto_otro?.message as string | undefined}
        />
      )}
    />
  );
}