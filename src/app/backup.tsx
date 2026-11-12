import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { createBackup, MIN_PASSPHRASE_LENGTH, restoreBackup } from '@/application/backup';
import { PasswordInput } from '@/components/PasswordInput';
import { pickBackupFile, saveBackupFile } from '@/data/backupFile';

type Busy = null | 'export' | 'restore';

export default function BackupScreen() {
  const [exportPass, setExportPass] = useState('');
  const [exportPass2, setExportPass2] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [busy, setBusy] = useState<Busy>(null);

  async function handleExport() {
    if (exportPass !== exportPass2) {
      Alert.alert('As senhas não conferem', 'Digite a mesma senha nos dois campos.');
      return;
    }
    setBusy('export');
    try {
      const content = await createBackup(exportPass);
      const name = await saveBackupFile(content);
      if (name == null) return; // user cancelled the folder picker
      setExportPass('');
      setExportPass2('');
      Alert.alert('Backup salvo', `Arquivo: ${name}\n\nGuarde a senha. Sem ela o backup não pode ser aberto.`);
    } catch (e) {
      Alert.alert('Não foi possível criar o backup', e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore() {
    if (restorePass.length === 0) {
      Alert.alert('Informe a senha', 'Digite a senha usada ao criar o backup.');
      return;
    }
    setBusy('restore');
    try {
      const text = await pickBackupFile();
      if (text == null) return; // cancelled
      const r = await restoreBackup(text, restorePass);
      setRestorePass('');
      Alert.alert(
        'Backup restaurado',
        `Lançamentos novos: ${r.transactions}\nMetas novas: ${r.goals}\nDepósitos novos: ${r.goalDeposits}\nCategorias atualizadas: ${r.categories}`,
      );
    } catch (e) {
      Alert.alert('Não foi possível restaurar', e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setBusy(null);
    }
  }

  const working = busy != null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.warning}>
        <Text style={styles.warningText}>
          O backup é criptografado com uma senha que só você sabe. Não existe como recuperá-la: se
          esquecer, o arquivo não abre. Guarde o arquivo no iCloud Drive ou em outro lugar fora do
          aparelho.
        </Text>
      </View>

      <Text style={styles.hint}>
        Criar e restaurar levam alguns segundos (até cerca de 1 minuto em aparelhos mais lentos): a
        senha passa por um cálculo propositalmente pesado para dificultar ataques. Não feche o app.
      </Text>

      <Text style={styles.section}>Criar backup</Text>
      <Text style={styles.label}>Senha do backup (mínimo {MIN_PASSPHRASE_LENGTH} caracteres)</Text>
      <PasswordInput
        style={styles.input}
        value={exportPass}
        onChangeText={setExportPass}
        accessibilityLabel="Senha do backup"
        editable={!working}
      />
      <Text style={styles.label}>Repita a senha</Text>
      <PasswordInput
        style={styles.input}
        value={exportPass2}
        onChangeText={setExportPass2}
        accessibilityLabel="Repita a senha"
        editable={!working}
      />
      <Pressable style={[styles.button, working && styles.disabled]} onPress={handleExport} disabled={working}>
        <Text style={styles.buttonText}>{busy === 'export' ? 'Criptografando…' : 'Escolher pasta e salvar'}</Text>
      </Pressable>

      <Text style={[styles.section, styles.sectionGap]}>Restaurar backup</Text>
      <Text style={styles.hint}>
        Os dados do backup são somados aos atuais. Nada é apagado e restaurar duas vezes não duplica.
      </Text>
      <Text style={styles.label}>Senha do backup</Text>
      <PasswordInput
        style={styles.input}
        value={restorePass}
        onChangeText={setRestorePass}
        accessibilityLabel="Senha do backup para restaurar"
        editable={!working}
      />
      <Pressable
        style={[styles.button, styles.secondary, working && styles.disabled]}
        onPress={handleRestore}
        disabled={working}
      >
        <Text style={[styles.buttonText, styles.secondaryText]}>
          {busy === 'restore' ? 'Descriptografando…' : 'Escolher arquivo e restaurar'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 8 },
  warning: { backgroundColor: '#fef3c7', borderRadius: 10, padding: 12 },
  warningText: { color: '#92400e', fontSize: 13, lineHeight: 18 },
  section: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 16 },
  sectionGap: { marginTop: 32 },
  label: { color: '#374151', fontSize: 14, fontWeight: '600', marginTop: 8 },
  hint: { color: '#6b7280', fontSize: 13 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, color: '#111827' },
  button: { backgroundColor: '#6366f1', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  secondary: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#6366f1' },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryText: { color: '#4338ca' },
});
