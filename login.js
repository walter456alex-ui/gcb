// Login functionality
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const verify2FABtn = document.getElementById('verify2FABtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const authTokenInput = document.getElementById('authToken');
    const errorMessage = document.getElementById('errorMessage');
    
    let loginEmail = '';
    
    // Handle form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        loginEmail = email;
        
        try {
            // First verify credentials with Firebase Auth (client-side)
            // Note: In production, you'd use Firebase SDK for client-side auth
            // For now, we'll use the backend API
            
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }
            
            if (data.requires2FA) {
                // Move to 2FA step
                step1.classList.remove('active');
                step2.classList.add('active');
                authTokenInput.focus();
            } else {
                // Redirect to dashboard
                window.location.href = '/dashboard';
            }
            
        } catch (error) {
            showError(error.message || 'Invalid email or password');
        }
    });
    
    // Handle 2FA verification
    verify2FABtn.addEventListener('click', async () => {
        const token = authTokenInput.value.trim();
        
        if (!token || token.length !== 6) {
            showError('Please enter a valid 6-digit code');
            return;
        }
        
        if (!/^\d{6}$/.test(token)) {
            showError('Code must contain only numbers');
            return;
        }
        
        try {
            verify2FABtn.disabled = true;
            verify2FABtn.textContent = 'Verifying...';
            
            const response = await fetch('/api/login/verify-2fa', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Verification failed');
            }
            
            // Redirect to dashboard
            window.location.href = '/dashboard';
            
        } catch (error) {
            verify2FABtn.disabled = false;
            verify2FABtn.textContent = 'Verify & Login';
            showError(error.message || 'Invalid authentication code. Please try again.');
            authTokenInput.value = '';
            authTokenInput.focus();
        }
    });
    
    // Handle cancel button
    cancelBtn.addEventListener('click', () => {
        step2.classList.remove('active');
        step1.classList.add('active');
        authTokenInput.value = '';
        hideError();
    });
    
    // Auto-format token input
    authTokenInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });
    
    // Check session on page load
    checkSession();
    
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }
    
    function hideError() {
        errorMessage.style.display = 'none';
    }
    
    async function checkSession() {
        try {
            const response = await fetch('/api/session');
            const data = await response.json();
            
            if (data.authenticated) {
                window.location.href = '/dashboard';
            }
        } catch (error) {
            // Ignore errors
        }
    }
});

