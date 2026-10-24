import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import type { ReactNode } from 'react';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  multiFactor,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  isFirebaseConfigured,
} from '../lib/firebase';
import type { User, TotpSecret, MultiFactorResolver } from '../lib/firebase';
import type { UserProfile } from '../types/crowdEvent';

type AuthMode = 'firebase' | 'demo';

export interface SetupTotpResult {
  secretKey: string;
  qrCodeUrl: string;
  secretObj?: TotpSecret;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authMode: AuthMode;
  mfaPending: boolean;
  mfaResolver: MultiFactorResolver | null;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInDemo: (name: string) => void;
  logout: () => Promise<void>;
  setupGoogleAuthenticator: () => Promise<SetupTotpResult>;
  verifyAndEnrollGoogleAuth: (
    secretObj: TotpSecret | undefined,
    secretKey: string,
    code: string,
  ) => Promise<void>;
  disableGoogleAuth: () => Promise<void>;
  verifyTotpSignIn: (code: string) => Promise<void>;
  cancelMfa: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const getInitialState = () => {
  const demoModeKey = 'surge_demo_user';
  const demoStored = typeof window !== 'undefined' ? sessionStorage.getItem(demoModeKey) : null;
  if (demoStored) {
    try {
      const demoUser = JSON.parse(demoStored) as UserProfile;
      return {
        user: {
          uid: demoUser.uid,
          email: demoUser.email,
          displayName: demoUser.displayName,
          photoURL: demoUser.photoURL,
        } as User,
        profile: demoUser,
        authMode: 'demo' as AuthMode,
      };
    } catch {}
  }
  const defaultDemo: UserProfile = {
    uid: 'demo_operator',
    email: 'operator@surge.io',
    displayName: 'Control Room Operator',
    role: 'operator',
    createdAt: new Date().toISOString(),
  };
  return {
    user: {
      uid: defaultDemo.uid,
      email: defaultDemo.email,
      displayName: defaultDemo.displayName,
    } as User,
    profile: defaultDemo,
    authMode: 'demo' as AuthMode,
  };
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [initial] = useState(getInitialState);
  const [user, setUser] = useState<User | null>(initial.user);
  const [profile, setProfile] = useState<UserProfile | null>(initial.profile);
  const [loading] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<AuthMode>(initial.authMode);
  const [mfaPending, setMfaPending] = useState<boolean>(false);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [pendingDemoUser, setPendingDemoUser] = useState<UserProfile | null>(null);

  const createFirestoreProfile = useCallback(
    async (firebaseUser: User, displayName: string) => {
      if (!db) return;
      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);

      const mfaFactors = multiFactor(firebaseUser).enrolledFactors;
      const hasTotp = mfaFactors.some(
        (f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID,
      );

      if (!snap.exists()) {
        const newProfile: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? '',
          displayName: displayName || firebaseUser.displayName || 'Operator',
          photoURL: firebaseUser.photoURL ?? undefined,
          role: 'operator',
          createdAt: new Date().toISOString(),
          twoFactorEnabled: hasTotp,
        };
        await setDoc(userRef, { ...newProfile, createdAt: serverTimestamp() });
        setProfile(newProfile);
      } else {
        const data = snap.data() as Omit<UserProfile, 'createdAt'> & {
          createdAt?: { toDate?: () => Date };
        };
        setProfile({
          uid: data.uid,
          email: data.email,
          displayName: data.displayName,
          photoURL: data.photoURL,
          role: data.role,
          createdAt:
            data.createdAt?.toDate?.()?.toISOString() ||
            new Date().toISOString(),
          twoFactorEnabled: data.twoFactorEnabled ?? hasTotp,
        });
      }
    },
    [],
  );

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setAuthMode('firebase');
        try {
          await createFirestoreProfile(
            firebaseUser,
            firebaseUser.displayName || 'Operator',
          );
        } catch {
          const mfaFactors = multiFactor(firebaseUser).enrolledFactors;
          const hasTotp = mfaFactors.some(
            (f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID,
          );
          setProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            displayName: firebaseUser.displayName || 'Operator',
            photoURL: firebaseUser.photoURL ?? undefined,
            role: 'operator',
            createdAt: new Date().toISOString(),
            twoFactorEnabled: hasTotp,
          });
        }
      }
    });

    return () => unsubscribe();
  }, [createFirestoreProfile]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !isFirebaseConfigured) {
      throw new Error('Firebase is not configured. Please use Demo mode.');
    }
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      await createFirestoreProfile(
        result.user,
        result.user.displayName || 'Operator',
      );
    }
  }, [createFirestoreProfile]);

  const signUpWithEmail = useCallback(
    async (name: string, email: string, password: string) => {
      if (!auth || !isFirebaseConfigured) {
        throw new Error('Firebase is not configured. Please use Demo mode.');
      }
      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      await createFirestoreProfile(result.user, name);
    },
    [createFirestoreProfile],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!auth || !isFirebaseConfigured) {
        throw new Error('Firebase is not configured. Please use Demo mode.');
      }
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === 'auth/multi-factor-auth-required') {
          const resolver = getMultiFactorResolver(auth, err as any);
          setMfaResolver(resolver);
          setMfaPending(true);
          return;
        }
        throw err;
      }
    },
    [],
  );

  const signInDemo = useCallback((name: string) => {
    const demo2FAKey = 'surge_demo_2fa_active';
    const is2FAActive = sessionStorage.getItem(demo2FAKey) === 'true';

    const uid = 'demo_' + Math.random().toString(36).slice(2, 10);
    const displayName = name.trim() || 'Demo Operator';
    const demoProfile: UserProfile = {
      uid,
      email: `${displayName.toLowerCase().replace(/\s+/g, '.')}@demo.surge.io`,
      displayName,
      photoURL: undefined,
      role: 'operator',
      createdAt: new Date().toISOString(),
      twoFactorEnabled: is2FAActive,
    };

    if (is2FAActive) {
      setPendingDemoUser(demoProfile);
      setMfaPending(true);
      return;
    }

    const pseudoFirebaseUser: unknown = {
      uid: demoProfile.uid,
      email: demoProfile.email,
      displayName: demoProfile.displayName,
      photoURL: demoProfile.photoURL,
      isAnonymous: false,
      emailVerified: true,
      providerData: [],
      metadata: {
        creationTime: demoProfile.createdAt,
        lastSignInTime: new Date().toISOString(),
      },
    };
    sessionStorage.setItem(
      'surge_demo_user',
      JSON.stringify(demoProfile),
    );
    setUser(pseudoFirebaseUser as User);
    setProfile(demoProfile);
    setAuthMode('demo');
  }, []);

  const setupGoogleAuthenticator = useCallback(async (): Promise<SetupTotpResult> => {
    if (authMode === 'firebase' && user && auth) {
      const multiFactorSession = await multiFactor(user).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(
        multiFactorSession,
      );
      const qrUrl = secret.generateQrCodeUrl(
        user.email || 'operator@surge.io',
        'Surge Control Room',
      );
      return {
        secretKey: secret.secretKey,
        qrCodeUrl: qrUrl,
        secretObj: secret,
      };
    } else {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let mockSecret = '';
      for (let i = 0; i < 16; i++) {
        mockSecret += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const accountName = profile?.email || 'demo.operator@surge.io';
      const qrUrl = `otpauth://totp/Surge%20Control%20Room:${encodeURIComponent(accountName)}?secret=${mockSecret}&issuer=Surge%20Control%20Room`;
      return {
        secretKey: mockSecret,
        qrCodeUrl: qrUrl,
      };
    }
  }, [authMode, user, profile]);

  const verifyAndEnrollGoogleAuth = useCallback(
    async (
      secretObj: TotpSecret | undefined,
      secretKey: string,
      code: string,
    ) => {
      const cleanCode = code.replace(/\s+/g, '');
      if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
        throw new Error('Please enter a valid 6-digit code from Google Authenticator.');
      }

      if (authMode === 'firebase' && user && secretObj) {
        const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
          secretObj,
          cleanCode,
        );
        await multiFactor(user).enroll(assertion, 'Google Authenticator');
        if (db) {
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, { twoFactorEnabled: true });
        }
      } else {
        sessionStorage.setItem('surge_demo_2fa_active', 'true');
        sessionStorage.setItem('surge_demo_2fa_secret', secretKey);
      }

      setProfile((prev) => (prev ? { ...prev, twoFactorEnabled: true } : null));
    },
    [authMode, user],
  );

  const disableGoogleAuth = useCallback(async () => {
    if (authMode === 'firebase' && user) {
      const enrolled = multiFactor(user).enrolledFactors;
      const totpFactor = enrolled.find(
        (f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID,
      );
      if (totpFactor) {
        await multiFactor(user).unenroll(totpFactor);
      }
      if (db) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { twoFactorEnabled: false });
      }
    } else {
      sessionStorage.removeItem('surge_demo_2fa_active');
      sessionStorage.removeItem('surge_demo_2fa_secret');
    }
    setProfile((prev) => (prev ? { ...prev, twoFactorEnabled: false } : null));
  }, [authMode, user]);

  const verifyTotpSignIn = useCallback(
    async (code: string) => {
      const cleanCode = code.replace(/\s+/g, '');
      if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
        throw new Error('Please enter a valid 6-digit code.');
      }

      if (mfaResolver) {
        const totpHint = mfaResolver.hints.find(
          (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID,
        );
        if (!totpHint) {
          throw new Error('Google Authenticator factor not found on this account.');
        }
        const assertion = TotpMultiFactorGenerator.assertionForSignIn(
          totpHint.uid,
          cleanCode,
        );
        await mfaResolver.resolveSignIn(assertion);
        setMfaPending(false);
        setMfaResolver(null);
      } else if (pendingDemoUser) {
        const pseudoFirebaseUser: unknown = {
          uid: pendingDemoUser.uid,
          email: pendingDemoUser.email,
          displayName: pendingDemoUser.displayName,
          photoURL: pendingDemoUser.photoURL,
          isAnonymous: false,
          emailVerified: true,
          providerData: [],
          metadata: {
            creationTime: pendingDemoUser.createdAt,
            lastSignInTime: new Date().toISOString(),
          },
        };
        sessionStorage.setItem(
          'surge_demo_user',
          JSON.stringify(pendingDemoUser),
        );
        setUser(pseudoFirebaseUser as User);
        setProfile(pendingDemoUser);
        setAuthMode('demo');
        setMfaPending(false);
        setPendingDemoUser(null);
      } else {
        throw new Error('No pending 2FA authentication session found.');
      }
    },
    [mfaResolver, pendingDemoUser],
  );

  const cancelMfa = useCallback(() => {
    setMfaPending(false);
    setMfaResolver(null);
    setPendingDemoUser(null);
  }, []);

  const logout = useCallback(async () => {
    if (authMode === 'firebase' && auth) {
      await signOut(auth);
    }
    sessionStorage.removeItem('surge_demo_user');
    sessionStorage.removeItem('safecrowd_demo_user');
    setUser(null);
    setProfile(null);
    setMfaPending(false);
    setMfaResolver(null);
  }, [authMode]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        authMode,
        mfaPending,
        mfaResolver,
        signInWithGoogle,
        signUpWithEmail,
        signInWithEmail,
        signInDemo,
        logout,
        setupGoogleAuthenticator,
        verifyAndEnrollGoogleAuth,
        disableGoogleAuth,
        verifyTotpSignIn,
        cancelMfa,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
