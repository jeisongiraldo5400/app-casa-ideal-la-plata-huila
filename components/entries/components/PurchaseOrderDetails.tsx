import { StyleSheet, Text, View } from "react-native";

// Constants
import { Colors } from "@/constants/theme";
import { useEffect } from "react";
import { useEntriesStore } from "../infrastructure/store/entriesStore";


interface PurchaseOrderDetailsProps {
  purchaseOrderId: string;
}

export function PurchaseOrderDetails({ purchaseOrderId }: PurchaseOrderDetailsProps) {

  const { loadPurchaseOrderProgress } = useEntriesStore();

  useEffect(() => {
    if (purchaseOrderId) {
      loadPurchaseOrderProgress(purchaseOrderId);
    }
  }, [purchaseOrderId, loadPurchaseOrderProgress]);

  return (
    <View style={styles.progressContainer}>
      <Text style={styles.progressTitle}>Progreso de la Orden de Compra</Text>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressHeaderCell, { flex: 2 }]}>Producto</Text>
        <Text style={styles.progressHeaderCell}>Ord.</Text>
        <Text style={styles.progressHeaderCell}>Reg.</Text>
        <Text style={styles.progressHeaderCell}>Falt.</Text>
      </View>
    
           { /*<View
              key={item.id}
              style={[
                styles.progressRow,
                isComplete && styles.progressRowComplete,
              ]}
            >
              <Text
                style={[styles.progressCell, { flex: 2 }]}
                numberOfLines={1}
              >
                {item.product.name}
              </Text>
              <Text style={styles.progressCell}>{item.quantity}</Text>
              <Text style={styles.progressCell}>{0}</Text>
              <Text
                style={[
                  styles.progressCell,
                  {
                    fontWeight: "bold",
                    color: isComplete
                      ? Colors.success.main
                      : Colors.warning.main,
                  },
                ]}
              >
                10
              </Text>
            </View> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    margin: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 24,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  stepHeaderText: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text.primary,
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background.paper,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    paddingHorizontal: 12,
    marginBottom: 20,
    minHeight: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: Colors.text.primary,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text.primary,
    marginBottom: 8,
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: Colors.divider,
    borderRadius: 8,
    backgroundColor: Colors.background.paper,
    overflow: "hidden",
    minHeight: 56,
    justifyContent: "center",
  },
  picker: {
    height: 56,
  },
  pickerItem: {
    height: 56,
    fontSize: 16,
    color: Colors.text.primary,
  },
  continueButton: {
    marginTop: 8,
  },
  skipButton: {
    marginTop: 8,
  },
  supplierActions: {
    marginTop: 8,
  },
  purchaseOrderActions: {
    marginTop: 16,
  },
  button: {
    marginTop: 8,
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.text.secondary,
  },
  flowButton: {
    marginBottom: 16,
  },
  progressContainer: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: 16,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text.primary,
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    marginBottom: 8,
  },
  progressHeaderCell: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.text.secondary,
    textAlign: "center",
  },
  progressRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  progressRowComplete: {
    backgroundColor: Colors.success.light + "20",
  },
  progressCell: {
    flex: 1,
    fontSize: 13,
    color: Colors.text.primary,
    textAlign: "center",
  },
});
