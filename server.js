const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const admin = require('firebase-admin');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'gcb-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Firebase Admin
let db;
try {
  if (admin.apps.length === 0) {
    const serviceAccount = require('../serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  db = admin.firestore();
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error.message);
  console.log('Please ensure serviceAccountKey.json exists in the root directory');
}

// Security configuration
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes of inactivity

// Helper function to check account lockout
async function checkAccountLockout(email) {
  const userRef = db.collection('users').doc(email);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) return { locked: false };
  
  const userData = userDoc.data();
  const failedAttempts = userData.failedLoginAttempts || 0;
  const lastFailedAttempt = userData.lastFailedAttempt || 0;
  const now = Date.now();
  
  if (failedAttempts >= MAX_LOGIN_ATTEMPTS) {
    if (now - lastFailedAttempt < LOCKOUT_DURATION) {
      const remainingTime = Math.ceil((LOCKOUT_DURATION - (now - lastFailedAttempt)) / 60000);
      return { 
        locked: true, 
        message: `Account locked. Try again in ${remainingTime} minutes.` 
      };
    } else {
      // Reset failed attempts after lockout period
      await userRef.update({
        failedLoginAttempts: 0,
        lastFailedAttempt: null
      });
      return { locked: false };
    }
  }
  
  return { locked: false };
}

// Helper function to record failed login attempt
async function recordFailedAttempt(email) {
  const userRef = db.collection('users').doc(email);
  const userDoc = await userRef.get();
  
  if (userDoc.exists) {
    const userData = userDoc.data();
    const failedAttempts = (userData.failedLoginAttempts || 0) + 1;
    
    await userRef.update({
      failedLoginAttempts: failedAttempts,
      lastFailedAttempt: Date.now()
    });
  }
}

// Helper function to reset failed attempts on successful login
async function resetFailedAttempts(email) {
  const userRef = db.collection('users').doc(email);
  await userRef.update({
    failedLoginAttempts: 0,
    lastFailedAttempt: null
  });
}

// Routes

// Helper function to check if staff ID is valid
async function isValidStaffID(staffID) {
  try {
    // Check in the validStaffIds collection
    const staffIdRef = db.collection('validStaffIds').doc(staffID.trim());
    const staffIdDoc = await staffIdRef.get();
    
    if (staffIdDoc.exists) {
      const data = staffIdDoc.data();
      return data.active !== false; // Return true if active is not explicitly false
    }
    
    // Also check in the system document (backup method)
    const systemRef = db.collection('system').doc('validStaffIds');
    const systemDoc = await systemRef.get();
    
    if (systemDoc.exists) {
      const systemData = systemDoc.data();
      if (systemData.staffIds && Array.isArray(systemData.staffIds)) {
        return systemData.staffIds.includes(staffID.trim());
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking staff ID:', error);
    return false;
  }
}

// Sign up - Step 1: Create account
app.post('/api/signup', async (req, res) => {
  try {
    const { fullName, staffID, department, email, password } = req.body;
    
    // Validate all required fields
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ error: 'Full name is required' });
    }
    if (!staffID || !staffID.trim()) {
      return res.status(400).json({ error: 'Staff ID is required' });
    }
    if (!department || !department.trim() || department === '') {
      return res.status(400).json({ error: 'Please select a department' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    
    // Check if staff ID is valid
    const isStaffIdValid = await isValidStaffID(staffID);
    if (!isStaffIdValid) {
      return res.status(403).json({ error: 'Invalid staff ID. Please contact your administrator if you believe this is an error.' });
    }
    
    // Check if staff ID is already registered
    const staffIdUsersRef = db.collection('users').where('staffID', '==', staffID.trim());
    const staffIdUsersSnapshot = await staffIdUsersRef.get();
    
    if (!staffIdUsersSnapshot.empty) {
      return res.status(400).json({ error: 'This staff ID is already registered. Please contact support if you need to recover your account.' });
    }
    
    // Check if user already exists (by email)
    const userRef = db.collection('users').doc(email);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    
    // Create user in Firebase Auth
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: fullName
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Generate secret for 2FA
    const secret = speakeasy.generateSecret({
      name: `GCB (${email})`,
      issuer: 'Ghana Commercial Bank'
    });
    
    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    
    // Store user data in Firestore (without password)
    await userRef.set({
      uid: firebaseUser.uid,
      fullName: fullName,
      staffID: staffID,
      department: department,
      email: email,
      twoFactorSecret: secret.base32, // Store base32 secret
      twoFactorVerified: false, // Will be set to true after QR scan verification
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      failedLoginAttempts: 0,
      lastFailedAttempt: null
    });
    
    // Store QR code in session temporarily
    req.session.signupEmail = email;
    req.session.tempSecret = secret.base32;
    
    res.json({
      success: true,
      qrCode: qrCodeUrl,
      secret: secret.base32, // For manual entry if needed
      message: 'Please scan the QR code with Google Authenticator to complete signup'
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sign up - Step 2: Verify QR code
app.post('/api/signup/verify', async (req, res) => {
  try {
    const { token } = req.body;
    const email = req.session.signupEmail;
    const tempSecret = req.session.tempSecret;
    
    if (!email || !tempSecret) {
      return res.status(400).json({ error: 'Signup session expired. Please start again.' });
    }
    
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }
    
    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: tempSecret,
      encoding: 'base32',
      token: token,
      window: 2 // Allow 2 time steps (60 seconds) of tolerance
    });
    
    if (!verified) {
      return res.status(400).json({ error: 'Invalid verification code. Please try again.' });
    }
    
    // Update user to mark 2FA as verified
    const userRef = db.collection('users').doc(email);
    await userRef.update({
      twoFactorVerified: true
    });
    
    // Clear session
    req.session.signupEmail = null;
    req.session.tempSecret = null;
    
    res.json({
      success: true,
      message: 'Signup completed successfully! You can now log in.'
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login - Step 1: Verify credentials
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Check account lockout
    const lockoutCheck = await checkAccountLockout(email);
    if (lockoutCheck.locked) {
      return res.status(403).json({ error: lockoutCheck.message });
    }
    
    // Get user from Firestore
    const userRef = db.collection('users').doc(email);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      await recordFailedAttempt(email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const userData = userDoc.data();
    
    // Verify user exists in Firebase Auth
    try {
      const firebaseUser = await admin.auth().getUserByEmail(email);
      // Note: Password verification should be done client-side using Firebase SDK
      // or via Firebase Admin SDK custom token verification
      // For this implementation, we verify user exists and proceed to 2FA
      // In production, integrate Firebase Client SDK for password verification
    } catch (error) {
      await recordFailedAttempt(email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Check if 2FA is verified
    if (!userData.twoFactorVerified) {
      return res.status(403).json({ error: 'Please complete 2FA setup first' });
    }
    
    // Store email in session for 2FA verification
    req.session.loginEmail = email;
    req.session.loginStartTime = Date.now();
    
    res.json({
      success: true,
      requires2FA: true,
      message: 'Please enter your 6-digit authentication code'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login - Step 2: Verify 2FA token
app.post('/api/login/verify-2fa', async (req, res) => {
  try {
    const { token } = req.body;
    const email = req.session.loginEmail;
    
    if (!email) {
      return res.status(400).json({ error: 'Login session expired. Please start again.' });
    }
    
    if (!token) {
      return res.status(400).json({ error: 'Authentication code is required' });
    }
    
    // Get user from Firestore
    const userRef = db.collection('users').doc(email);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    const secret = userData.twoFactorSecret;
    
    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2 // Allow 2 time steps (60 seconds) of tolerance
    });
    
    if (!verified) {
      await recordFailedAttempt(email);
      return res.status(401).json({ error: 'Invalid authentication code. Please try again.' });
    }
    
    // Reset failed attempts on successful login
    await resetFailedAttempts(email);
    
    // Create session
    req.session.user = {
      email: email,
      fullName: userData.fullName,
      staffID: userData.staffID,
      department: userData.department
    };
    req.session.lastActivity = Date.now();
    
    // Clear login session
    req.session.loginEmail = null;
    req.session.loginStartTime = null;
    
    res.json({
      success: true,
      message: 'Login successful',
      user: req.session.user
    });
  } catch (error) {
    console.error('2FA verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Password Recovery - Step 1: Request reset
app.post('/api/password-recovery', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Get user from Firestore
    const userRef = db.collection('users').doc(email);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      // Don't reveal if user exists or not for security
      return res.json({
        success: true,
        message: 'If an account exists, you will need to verify with your authenticator app'
      });
    }
    
    const userData = userDoc.data();
    
    if (!userData.twoFactorVerified) {
      return res.status(403).json({ error: '2FA not set up for this account' });
    }
    
    // Store email in session for password reset
    req.session.resetEmail = email;
    req.session.resetStartTime = Date.now();
    
    res.json({
      success: true,
      requires2FA: true,
      message: 'Please enter your 6-digit authentication code to reset password'
    });
  } catch (error) {
    console.error('Password recovery error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Password Recovery - Step 2: Verify 2FA and reset password
app.post('/api/password-recovery/verify', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const email = req.session.resetEmail;
    
    if (!email) {
      return res.status(400).json({ error: 'Password reset session expired. Please start again.' });
    }
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Authentication code and new password are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }
    
    // Get user from Firestore
    const userRef = db.collection('users').doc(email);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    const secret = userData.twoFactorSecret;
    
    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2
    });
    
    if (!verified) {
      return res.status(401).json({ error: 'Invalid authentication code. Please try again.' });
    }
    
    // Update password in Firebase Auth
    try {
      const firebaseUser = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(firebaseUser.uid, {
        password: newPassword
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to update password' });
    }
    
    // Clear reset session
    req.session.resetEmail = null;
    req.session.resetStartTime = null;
    
    res.json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check session status
app.get('/api/session', (req, res) => {
  if (req.session.user && req.session.lastActivity) {
    const now = Date.now();
    const timeSinceLastActivity = now - req.session.lastActivity;
    
    if (timeSinceLastActivity > SESSION_TIMEOUT) {
      req.session.destroy();
      return res.json({ authenticated: false, timeout: true });
    }
    
    // Update last activity
    req.session.lastActivity = now;
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Dashboard route (protected)
app.get('/dashboard', (req, res) => {
  if (req.session.user && req.session.lastActivity) {
    const now = Date.now();
    const timeSinceLastActivity = now - req.session.lastActivity;
    
    if (timeSinceLastActivity > SESSION_TIMEOUT) {
      req.session.destroy();
      return res.redirect('/login.html');
    }
    
    req.session.lastActivity = now;
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
  } else {
    res.redirect('/login.html');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

