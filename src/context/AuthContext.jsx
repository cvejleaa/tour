// Delt auth-kontekst. Eksponerer den indloggede bruger + Firestore-profil
// (navn, rolle, status) til hele appen via useAuth().
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { COL, ROLES, USER_STATUS } from '../lib/constants';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Firebase Auth-bruger
  const [profile, setProfile] = useState(null); // Firestore users/{uid}
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const ref = doc(db, COL.USERS, user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const role = profile?.role || ROLES.PLAYER;
  const status = profile?.status || USER_STATUS.PENDING;

  const value = {
    user,
    profile,
    loading,
    role,
    status,
    isApproved: status === USER_STATUS.APPROVED,
    isOwner: role === ROLES.OWNER,
    // Global admin = ejer eller udpeget global admin (fuld daglig drift)
    isGlobalAdmin: role === ROLES.OWNER || role === ROLES.GLOBAL_ADMIN,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth skal bruges inden i AuthProvider');
  return ctx;
}
