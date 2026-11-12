import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, loginWithGoogle, logoutUser, testConnection } from '../services/firebase';
import { UserProfile, UserRole, ROOT_ADMIN_EMAIL } from '../types';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isTechnician: boolean;
  isRequester: boolean;
  isViewer: boolean;
  isPendingApproval: boolean;
  userLocationIds: string[];
  recheckApproval: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userLocationIds, setUserLocationIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const unsubDocRef = useRef<(() => void) | null>(null);
  const unsubAllowRef = useRef<(() => void) | null>(null);

  const resolveUserProfile = async (user: User, email: string, assignedRole: UserRole) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userDocRef);

      let finalProfile: UserProfile;

      if (!userSnap.exists()) {
        finalProfile = {
          uid: user.uid,
          email,
          displayName: user.displayName || email.split('@')[0],
          photoURL: user.photoURL || '',
          role: assignedRole,
          disabled: false,
          createdAt: new Date().toISOString(),
        };
        await setDoc(userDocRef, finalProfile);
      } else {
        const existing = userSnap.data() as UserProfile;
        if (existing.role !== assignedRole || existing.disabled) {
          await setDoc(userDocRef, { role: assignedRole, disabled: false }, { merge: true });
          existing.role = assignedRole;
          existing.disabled = false;
        }
        finalProfile = existing;
      }

      setUserProfile(finalProfile);
      setCurrentUser(user);
      setIsPendingApproval(false);

      unsubDocRef.current = onSnapshot(
        userDocRef,
        (snap) => {
          if (snap.exists()) {
            setUserProfile(snap.data() as UserProfile);
          }
        },
        (err) => {
          console.warn('User profile listener non-fatal note:', err);
        }
      );
    } catch (userErr) {
      console.warn('Profile sync non-fatal error:', userErr);
      setCurrentUser(user);
      setUserProfile({
        uid: user.uid,
        email,
        displayName: user.displayName || email.split('@')[0],
        photoURL: user.photoURL || '',
        role: assignedRole,
        disabled: false,
        createdAt: new Date().toISOString(),
      });
      setIsPendingApproval(false);
    }
  };

  useEffect(() => {
    // Run test connection
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Unsubscribe any prior listeners
      if (unsubDocRef.current) {
        unsubDocRef.current();
        unsubDocRef.current = null;
      }
      if (unsubAllowRef.current) {
        unsubAllowRef.current();
        unsubAllowRef.current = null;
      }

      setLoading(true);

      if (!user) {
        setCurrentUser(null);
        setUserProfile(null);
        setIsPendingApproval(false);
        setLoading(false);
        return;
      }

      const rawEmail = (user.email || '').trim();
      const email = rawEmail.toLowerCase();

      // Điều kiện 1: Có email
      if (!email) {
        await logoutUser();
        setCurrentUser(null);
        setUserProfile(null);
        setIsPendingApproval(false);
        setError('Không nhận được địa chỉ email từ tài khoản Google.');
        setLoading(false);
        return;
      }

      // Điều kiện 2: Email đã được xác minh bởi Google
      if (!user.emailVerified) {
        await logoutUser();
        setCurrentUser(null);
        setUserProfile(null);
        setIsPendingApproval(false);
        setError(`Email "${rawEmail}" chưa được xác minh bởi Google (email_verified = false). Vui lòng xác minh địa chỉ email trước khi đăng nhập.`);
        setLoading(false);
        return;
      }

      // Điều kiện 3: Kiểm tra ngoại lệ ADMIN GỐC TRƯỚC TIÊN
      const normalizedRootAdmin = ROOT_ADMIN_EMAIL.toLowerCase().trim();
      const isRootAdmin = email === normalizedRootAdmin;

      if (isRootAdmin) {
        setIsPendingApproval(false);
        const adminProfile: UserProfile = {
          uid: user.uid,
          email,
          displayName: user.displayName || 'Trưởng nhóm Kỹ thuật (Admin gốc)',
          photoURL: user.photoURL || '',
          role: 'admin',
          disabled: false,
          createdAt: new Date().toISOString(),
        };

        setCurrentUser(user);
        setUserProfile(adminProfile);
        setLoading(false);

        // Đồng bộ dữ liệu users/{uid} và allowedUsers trong nền
        (async () => {
          try {
            const userDocRef = doc(db, 'users', user.uid);
            await setDoc(userDocRef, adminProfile, { merge: true });

            const rootAllowRef = doc(db, 'allowedUsers', email);
            await setDoc(
              rootAllowRef,
              {
                email,
                name: user.displayName || 'Trưởng nhóm Kỹ thuật (Admin gốc)',
                role: 'admin',
                active: true,
                addedBy: 'system',
                addedAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString(),
              },
              { merge: true }
            );

            unsubDocRef.current = onSnapshot(
              userDocRef,
              (snap) => {
                if (snap.exists()) {
                  const data = snap.data() as UserProfile;
                  setUserProfile({ ...data, role: 'admin', disabled: false });
                }
              },
              (err) => {
                console.warn('Admin profile listener non-fatal note:', err);
              }
            );
          } catch (syncErr) {
            console.warn('Root admin background sync note:', syncErr);
          }
        })();

        return;
      }

      // Điều kiện 4: Kiểm tra danh sách được cấp quyền allowedUsers
      let allowSnap = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          const allowRef = doc(db, 'allowedUsers', email);
          allowSnap = await getDoc(allowRef);
          break;
        } catch (fetchErr: any) {
          console.warn(`Attempt ${attempts} fetching allowedUsers:`, fetchErr);
          if (attempts < maxAttempts && (fetchErr?.code === 'unavailable' || fetchErr?.message?.includes('offline'))) {
            await new Promise((res) => setTimeout(res, 800 * attempts));
            continue;
          }
          break;
        }
      }

      // TRƯỜNG HỢP 1: Tài khoản chưa có trong allowedUsers -> Chuyển sang màn hình "Chờ duyệt"
      if (!allowSnap || !allowSnap.exists()) {
        setCurrentUser(user);
        setUserProfile(null);
        setIsPendingApproval(true);
        setLoading(false);

        // Lắng nghe realtime: Khi admin duyệt, tự động mở quyền vào hệ thống ngay lập tức!
        const allowRef = doc(db, 'allowedUsers', email);
        unsubAllowRef.current = onSnapshot(
          allowRef,
          async (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              if (data?.active === true) {
                const assignedRole = (data.role as UserRole) || 'requester';
                if (Array.isArray(data.locationIds)) {
                  setUserLocationIds(data.locationIds);
                }
                await resolveUserProfile(user, email, assignedRole);
              }
            }
          },
          (err) => {
            console.warn('Waiting approval listener note:', err);
          }
        );

        return;
      }

      // TRƯỜNG HỢP 2: Tài khoản có trong allowedUsers nhưng active === false -> Bị vô hiệu hóa
      const allowData = allowSnap.data();
      if (allowData?.active !== true) {
        setCurrentUser(user);
        setUserProfile({
          uid: user.uid,
          email,
          displayName: user.displayName || email.split('@')[0],
          photoURL: user.photoURL || '',
          role: (allowData.role as UserRole) || 'requester',
          disabled: true,
          createdAt: new Date().toISOString(),
        });
        setUserLocationIds(Array.isArray(allowData?.locationIds) ? allowData.locationIds : []);
        setIsPendingApproval(false);
        setLoading(false);
        return;
      }

      // TRƯỜNG HỢP 3: Hợp lệ với active === true -> Vào ứng dụng bình thường
      const assignedRole = (allowData.role as UserRole) || 'requester';
      setUserLocationIds(Array.isArray(allowData?.locationIds) ? allowData.locationIds : []);

      // Cập nhật lastLoginAt trong allowedUsers (non-blocking)
      updateDoc(doc(db, 'allowedUsers', email), {
        lastLoginAt: new Date().toISOString(),
      }).catch((e) => console.warn('Could not update lastLoginAt:', e));

      // Lắng nghe trạng thái thu hồi quyền real-time: tự khóa nếu active đổi thành false, cập nhật locationIds
      const allowRef = doc(db, 'allowedUsers', email);
      unsubAllowRef.current = onSnapshot(
        allowRef,
        async (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data?.active === false) {
              setUserProfile((prev) => (prev ? { ...prev, disabled: true } : null));
            }
            if (Array.isArray(data?.locationIds)) {
              setUserLocationIds(data.locationIds);
            }
          }
        },
        (err) => {
          console.warn('Allowlist listener non-fatal note:', err);
        }
      );

      await resolveUserProfile(user, email, assignedRole);
      setLoading(false);
    });

    return () => {
      if (unsubDocRef.current) {
        unsubDocRef.current();
        unsubDocRef.current = null;
      }
      if (unsubAllowRef.current) {
        unsubAllowRef.current();
        unsubAllowRef.current = null;
      }
      unsubscribe();
    };
  }, []);

  const recheckApproval = async () => {
    if (!currentUser || !currentUser.email) return;
    const email = currentUser.email.toLowerCase().trim();
    try {
      const snap = await getDoc(doc(db, 'allowedUsers', email));
      if (snap.exists() && snap.data()?.active === true) {
        const assignedRole = (snap.data().role as UserRole) || 'requester';
        await resolveUserProfile(currentUser, email, assignedRole);
      }
    } catch (e) {
      console.warn('Recheck approval note:', e);
    }
  };

  const login = async () => {
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập thất bại';
      setError(msg);
      throw err;
    }
  };

  const logout = async () => {
    try {
      if (unsubDocRef.current) {
        unsubDocRef.current();
        unsubDocRef.current = null;
      }
      if (unsubAllowRef.current) {
        unsubAllowRef.current();
        unsubAllowRef.current = null;
      }
      setUserProfile(null);
      setCurrentUser(null);
      setUserLocationIds([]);
      setIsPendingApproval(false);
      await logoutUser();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng xuất thất bại';
      setError(msg);
    }
  };

  const role = userProfile?.role;
  const isAdmin = role === 'admin';
  const isTechnician = role === 'technician' || isAdmin;
  const isRequester = role === 'requester';
  const isViewer = role === 'viewer';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        isAdmin,
        isTechnician,
        isRequester,
        isViewer,
        isPendingApproval,
        userLocationIds,
        recheckApproval,
        login,
        logout,
        error,
        clearError: () => setError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

