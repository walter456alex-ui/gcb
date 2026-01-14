// Password recovery functionality
document.addEventListener('DOMContentLoaded', () => {
    const recoveryForm = document.getElementById('recoveryForm');
    const newPasswordForm = document.getElementById('newPasswordForm');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const verify2FABtn = document.getElementById('verify2FABtn');
    const backBtn = document.getElementById('backBtn');
    const authTokenInput = document.getElementById('authToken');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    
    let recoveryEmail = '';
    let verifiedToken = '';
    
    // Step 1: Request password recovery
    recoveryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMessages();
        
        const email = document.getElementById('email').value.trim();
        recoveryEmail = email;
        
        try {
            const response = await fetch('/api/password-recovery', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Password recovery request failed');
            }
            
            if (data.requires2FA) {
                // Move to 2FA step
                step1.classList.remove('active');
                step2.classList.add('active');
                authTokenInput.focus();
            } else {
                // Show success message (even if user doesn't exist for security)
                showSuccess('If an account exists, please check your email for further instructions.');
            }
            
        } catch (error) {
            showError(error.message || 'An error occurred');
        }
    });
    
    // Step 2: Verify 2FA
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
            
            // Store token temporarily (will be verified when setting new password)
            verifiedToken = token;
            
            // Move to password reset step
            step2.classList.remove('active');
            step3.classList.add('active');
            document.getElementById('newPassword').focus();
            
            verify2FABtn.disabled = false;
            verify2FABtn.textContent = 'Verify';
            
        } catch (error) {
            verify2FABtn.disabled = false;
            verify2FABtn.textContent = 'Verify';
            showError(error.message || 'Verification failed');
        }
    });
    
    // Step 3: Set new password
    newPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMessages();
        
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (newPassword.length < 8) {
            showError('Password must be at least 8 characters long');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }
        
        if (!verifiedToken) {
            showError('Please verify your identity first');
            return;
        }
        
        try {
            const submitBtn = newPasswordForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Resetting Password...';
            
            const response = await fetch('/api/password-recovery/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: verifiedToken,
                    newPassword: newPassword
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Password reset failed');
            }
            
            showSuccess(data.message || 'Password reset successfully! Redirecting to login...');
            
            // Redirect to login after 3 seconds
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 3000);
            
        } catch (error) {
            const submitBtn = newPasswordForm.querySelector('button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Reset Password';
            showError(error.message || 'Password reset failed. Please try again.');
        }
    });
    
    // Handle back button
    backBtn.addEventListener('click', () => {
        step2.classList.remove('active');
        step1.classList.add('active');
        authTokenInput.value = '';
        verifiedToken = '';
        hideMessages();
    });
    
    // Auto-format token input
    authTokenInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });
    
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
    }
    
    function showSuccess(message) {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
    }
    
    function hideMessages() {
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
    }
});

