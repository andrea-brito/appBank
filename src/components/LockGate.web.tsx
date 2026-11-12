import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  lastEmail,
  recoverAccount,
  recoveryLinkState,
  requestPasswordReset,
  unlockVault,
} from '@/data/db/client.web';

// Ask for the passphrase again after the page was hidden this long.
const RELOCK_AFTER_MS = 60_000;
// The encrypted data sits on a server, so the passphrase must resist offline
// guessing: longer than the 8 required for a backup file.
const MIN_ACCOUNT_PASSPHRASE = 12;

type Screen = 'signin' | 'signup' | 'forgot' | 'recover' | 'code';

/**
 * Web lock screen. Replaces Face ID: e-mail + passphrase log into Supabase AND
 * unlock the end-to-end encrypted data. Also handles the recovery-key flow.
 * Same overlay strategy as the native gate: children stay mounted while re-locked.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const [link] = useState(recoveryLinkState);
  const [screen, setScreen] = useState<Screen>(() =>
    link === 'valid' ? 'recover' : lastEmail() ? 'signin' : 'signup',
  );
  const [email, setEmail] = useState(lastEmail);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [everUnlocked, setEverUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(
    link === 'expired' ? 'O link de recuperação expirou ou já foi usado. Peça outro.' : null,
  );
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  const relock = everUnlocked;
  const choosingPass = !relock && (screen === 'signup' || screen === 'recover');

  function go(next: Screen) {
    setScreen(next);
    setError(null);
    setInfo(null);
    setPass('');
    setPass2('');
  }

  function enter() {
    setPass('');
    setPass2('');
    setCodeInput('');
    setNewCode(null);
    setUnlocked(true);
    setEverUnlocked(true);
  }

  function validate(): string | null {
    if (!relock && screen !== 'recover' && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return 'Informe um e-mail válido.';
    }
    if (screen === 'recover' && codeInput.trim() === '') return 'Digite sua chave de recuperação.';
    if (choosingPass) {
      if (pass.length < MIN_ACCOUNT_PASSPHRASE) {
        return `A senha precisa ter pelo menos ${MIN_ACCOUNT_PASSPHRASE} caracteres.`;
      }
      if (pass !== pass2) return 'As senhas não conferem.';
    }
    return null;
  }

  async function submit() {
    if (busy) return;
    if (screen === 'code' && !relock) {
      enter();
      return;
    }
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (relock || screen === 'signin' || screen === 'signup') {
        const code = await unlockVault(email, pass, !relock && screen === 'signup' ? 'signup' : 'signin');
        if (code) {
          setNewCode(code);
          setScreen('code');
          setPass('');
          setPass2('');
        } else {
          enter();
        }
      } else if (screen === 'forgot') {
        await requestPasswordReset(email);
        setInfo(
          'Se o e-mail estiver cadastrado, enviamos um link. Abra-o e tenha sua chave de recuperação em mãos.',
        );
      } else if (screen === 'recover') {
        await recoverAccount(codeInput, pass);
        enter();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!newCode) return;
    try {
      await navigator.clipboard.writeText(newCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current != null && Date.now() - hiddenAt.current >= RELOCK_AFTER_MS) {
        hiddenAt.current = null;
        setUnlocked(false);
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const titles: Record<Screen, string> = {
    signin: 'Entrar no appBank',
    signup: 'Criar conta',
    forgot: 'Esqueci a senha',
    recover: 'Criar nova senha',
    code: 'Sua chave de recuperação',
  };
  const buttons: Record<Screen, string> = {
    signin: 'Entrar',
    signup: 'Criar conta',
    forgot: 'Enviar link por e-mail',
    recover: 'Recuperar e entrar',
    code: 'Já guardei minha chave',
  };

  return (
    <View style={styles.root}>
      <View style={styles.root} aria-hidden={!unlocked} pointerEvents={unlocked ? 'auto' : 'none'}>
        {everUnlocked && children}
      </View>
      {!unlocked && (
        <View style={styles.lock} accessibilityViewIsModal>
          <View style={styles.card}>
            <Text style={styles.icon}>{screen === 'code' && !relock ? '🔑' : '🔒'}</Text>
            <Text style={styles.title} role="heading">
              {relock ? 'appBank bloqueado' : titles[screen]}
            </Text>

            {!relock && screen === 'signup' && (
              <Text style={styles.hint}>
                A senha criptografa seus dados antes de irem para o servidor: nem o servidor consegue
                lê-los. Depois de criar a conta você recebe uma chave de recuperação.
              </Text>
            )}
            {!relock && screen === 'forgot' && (
              <Text style={styles.hint}>
                Para recuperar você vai precisar do link enviado ao seu e-mail e da sua chave de
                recuperação. Sem a chave, não é possível recuperar os dados.
              </Text>
            )}
            {!relock && screen === 'recover' && (
              <Text style={styles.hint}>
                Digite a chave de recuperação que você guardou ao criar a conta e escolha uma nova
                senha. Seus dados continuam os mesmos.
              </Text>
            )}

            {!relock && screen === 'code' && newCode && (
              <>
                <Text style={styles.hint}>
                  Se você esquecer a senha, só esta chave recupera seus dados. Anote ou salve num lugar
                  seguro fora deste app (por exemplo, impressa ou nas Notas com bloqueio). Ela não será
                  mostrada de novo.
                </Text>
                <Text style={styles.code} selectable accessibilityLabel={`Chave: ${newCode.split('').join(' ')}`}>
                  {newCode}
                </Text>
                <Pressable style={styles.secondary} onPress={copyCode} accessibilityRole="button">
                  <Text style={styles.secondaryText}>{copied ? 'Copiada ✓' : 'Copiar chave'}</Text>
                </Pressable>
              </>
            )}

            {!relock && (screen === 'signin' || screen === 'signup' || screen === 'forgot') && (
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="E-mail"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!busy}
                accessibilityLabel="E-mail"
              />
            )}
            {!relock && screen === 'recover' && (
              <TextInput
                style={[styles.input, styles.mono]}
                value={codeInput}
                onChangeText={setCodeInput}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                accessibilityLabel="Chave de recuperação"
              />
            )}
            {(relock || screen === 'signin' || screen === 'signup' || screen === 'recover') && (
              <TextInput
                style={styles.input}
                value={pass}
                onChangeText={setPass}
                placeholder={screen === 'recover' && !relock ? 'Nova senha' : 'Senha'}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={choosingPass ? 'new-password' : 'current-password'}
                editable={!busy}
                onSubmitEditing={submit}
                accessibilityLabel={screen === 'recover' && !relock ? 'Nova senha' : 'Senha'}
              />
            )}
            {choosingPass && (
              <TextInput
                style={styles.input}
                value={pass2}
                onChangeText={setPass2}
                placeholder="Repita a senha"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                editable={!busy}
                onSubmitEditing={submit}
                accessibilityLabel="Repita a senha"
              />
            )}

            {error && (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {error}
              </Text>
            )}
            {info && (
              <Text style={styles.info} accessibilityLiveRegion="polite">
                {info}
              </Text>
            )}

            <Pressable
              style={[styles.button, busy && styles.disabled]}
              onPress={submit}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{relock ? 'Desbloquear' : buttons[screen]}</Text>
              )}
            </Pressable>

            {!relock && screen === 'signin' && (
              <>
                <Link label="Esqueci a senha" onPress={() => go('forgot')} disabled={busy} />
                <Link label="Criar uma conta" onPress={() => go('signup')} disabled={busy} />
              </>
            )}
            {!relock && screen === 'signup' && (
              <Link label="Já tenho conta: entrar" onPress={() => go('signin')} disabled={busy} />
            )}
            {!relock && (screen === 'forgot' || screen === 'recover') && (
              <Link label="Voltar para entrar" onPress={() => go('signin')} disabled={busy} />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function Link({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button">
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  lock: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f9fafb',
  },
  card: { width: '100%', maxWidth: 400, gap: 12, alignItems: 'stretch' },
  icon: { fontSize: 48, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
  hint: { color: '#4b5563', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, color: '#111827' },
  mono: { fontFamily: 'monospace', fontSize: 14 },
  code: {
    fontFamily: 'monospace',
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 16,
    letterSpacing: 1,
  },
  error: { color: '#b91c1c', textAlign: 'center' },
  info: { color: '#065f46', textAlign: 'center' },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 4,
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { color: '#4338ca', fontWeight: '700' },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: '#4338ca', textAlign: 'center', padding: 8, fontWeight: '600' },
});
