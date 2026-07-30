import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

type ThemeColors = {
  text: { primary: string; secondary: string };
  primary: { main: string; contrastText: string };
  background: { default: string; paper: string };
  divider: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  colors: ThemeColors;
};

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const WEEK_DAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

const toDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const fromDateValue = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const displayDate = (value: string) => {
  const date = fromDateValue(value);
  if (!date) return 'Seleccionar fecha';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

export function NegocioDatePicker({ value, onChange, colors }: Props) {
  const [visible, setVisible] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = fromDateValue(value);
    const base = selected || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const todayValue = toDateValue(new Date());
  const days = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const leading = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: count }, (_, index) => index + 1),
    ];
  }, [visibleMonth]);

  const open = () => {
    const selected = fromDateValue(value);
    const base = selected || new Date();
    setVisibleMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setVisible(true);
  };

  const changeMonth = (offset: number) => {
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1)
    );
  };

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Seleccionar fecha de la primera cuota"
        onPress={open}
        style={[
          styles.dateField,
          { borderColor: colors.divider, backgroundColor: colors.background.paper },
        ]}
      >
        <Text
          style={{
            color: value ? colors.text.primary : colors.text.secondary,
            fontSize: 15,
            textTransform: value ? 'capitalize' : 'none',
          }}
        >
          {displayDate(value)}
        </Text>
        <MaterialIcons name="calendar-month" size={22} color={colors.primary.main} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: colors.background.paper }]}>
            <View style={styles.header}>
              <TouchableOpacity
                accessibilityLabel="Mes anterior"
                onPress={() => changeMonth(-1)}
                style={styles.iconButton}
              >
                <MaterialIcons name="chevron-left" size={26} color={colors.text.primary} />
              </TouchableOpacity>
              <Text style={[styles.monthTitle, { color: colors.text.primary }]}>
                {MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                accessibilityLabel="Mes siguiente"
                onPress={() => changeMonth(1)}
                style={styles.iconButton}
              >
                <MaterialIcons name="chevron-right" size={26} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarGrid}>
              {WEEK_DAYS.map((label, index) => (
                <View key={`${label}-${index}`} style={styles.dayCell}>
                  <Text style={[styles.weekDay, { color: colors.text.secondary }]}>
                    {label}
                  </Text>
                </View>
              ))}
              {days.map((day, index) => {
                if (!day) return <View key={`empty-${index}`} style={styles.dayCell} />;
                const date = new Date(
                  visibleMonth.getFullYear(),
                  visibleMonth.getMonth(),
                  day
                );
                const dateValue = toDateValue(date);
                const selected = dateValue === value;
                const disabled = dateValue < todayValue;
                return (
                  <Pressable
                    key={dateValue}
                    disabled={disabled}
                    onPress={() => {
                      onChange(dateValue);
                      setVisible(false);
                    }}
                    style={[
                      styles.dayCell,
                      selected && {
                        backgroundColor: colors.primary.main,
                        borderRadius: 20,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected
                          ? colors.primary.contrastText
                          : disabled
                          ? colors.text.secondary
                          : colors.text.primary,
                        opacity: disabled ? 0.35 : 1,
                        fontWeight: selected ? '700' : '500',
                      }}
                    >
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.cancelButton}>
                <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const today = new Date();
                  setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                  onChange(toDateValue(today));
                  setVisible(false);
                }}
                style={[styles.todayButton, { backgroundColor: colors.primary.main }]}
              >
                <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>
                  Hoy
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dateField: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    borderRadius: 18,
    padding: 16,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthTitle: { fontSize: 17, fontWeight: '700', textTransform: 'capitalize' },
  iconButton: { padding: 8 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDay: { fontSize: 12, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  cancelButton: { paddingHorizontal: 14, paddingVertical: 10 },
  todayButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
});
