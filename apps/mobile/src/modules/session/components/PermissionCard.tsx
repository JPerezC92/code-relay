import { Button, StyleSheet, Text, View } from 'react-native';
import type { PermissionRequest } from '@/modules/session/domain/entities/session';

export interface PermissionCardProps {
  permission: PermissionRequest;
  onApproveOnce: () => void;
  onReject: () => void;
}

/**
 * Permission prompt with exactly two choices: approve once or reject. A
 * standing grant is intentionally not offered.
 */
export function PermissionCard({ permission, onApproveOnce, onReject }: PermissionCardProps) {
  return (
    <View style={styles.card} testID={`permission-${permission.id}`}>
      <Text style={styles.title}>Permission requested</Text>
      <Text style={styles.detail}>{permission.title}</Text>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button title="Approve once" onPress={onApproveOnce} />
        </View>
        <View style={styles.action}>
          <Button title="Reject" color="#b91c1c" onPress={onReject} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    marginVertical: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  detail: {
    fontSize: 14,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  action: {
    marginRight: 12,
    marginBottom: 4,
  },
});
