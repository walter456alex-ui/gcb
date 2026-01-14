// Signup functionality
document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signupForm');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const qrCode = document.getElementById('qrCode');
    const qrLoader = document.getElementById('qrLoader');
    const verifyBtn = document.getElementById('verifyBtn');
    const backBtn = document.getElementById('backBtn');
    const verifyTokenInput = document.getElementById('verifyToken');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const manualEntry = document.querySelector('.manual-entry');
    const manualSecret = document.getElementById('manualSecret');
    
    let signupData = {};
    
    // Handle form submission
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMessages();
        
        // Get form data
        signupData = {
            fullName: document.getElementById('fullName').value.trim(),
            staffID: document.getElementById('staffID').value.trim(),
            department: document.getElementById('department').value.trim(),
            email: document.getElementById('email').value.trim(),
            password: document.getElementById('password').value
        };
        
        // Validate password
        if (signupData.password.length < 8) {
            showError('Password must be at least 8 characters long');
            return;
        }
        
        try {
            // Show loader
            qrLoader.style.display = 'block';
            qrCode.style.display = 'none';
            
            // Call signup API
            const response = await fetch('/api/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(signupData)
            });
            
            // Check if response is ok before parsing JSON
            if (!response.ok) {
                let errorMessage = 'Signup failed';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = `Server error: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }
            
            const data = await response.json();
            
            // Display QR code
            qrCode.src = data.qrCode;
            qrCode.style.display = 'block';
            qrLoader.style.display = 'none';
            
            // Show manual entry option
            if (data.secret) {
                manualSecret.textContent = data.secret;
                manualEntry.style.display = 'block';
            }
            
            // Move to step 2
            step1.classList.remove('active');
            step2.classList.add('active');
            
        } catch (error) {
            qrLoader.style.display = 'none';
            console.error('Signup error:', error);
            
            // Better error messages for common issues
            let errorMsg = error.message || 'An error occurred during signup';
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMsg = 'Unable to connect to server. Please ensure the server is running and try again.';
            }
            showError(errorMsg);
        }
    });
    
    // Handle verification
    verifyBtn.addEventListener('click', async () => {
        const token = verifyTokenInput.value.trim();
        
        if (!token || token.length !== 6) {
            showError('Please enter a valid 6-digit code');
            return;
        }
        
        if (!/^\d{6}$/.test(token)) {
            showError('Code must contain only numbers');
            return;
        }
        
        try {
            verifyBtn.disabled = true;
            verifyBtn.textContent = 'Verifying...';
            
            const response = await fetch('/api/signup/verify', {
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
            
            showSuccess(data.message || 'Signup completed successfully! Redirecting to login...');
            
            // Redirect to login after 3 seconds
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 3000);
            
        } catch (error) {
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Verify & Complete Signup';
            showError(error.message || 'Verification failed. Please try again.');
        }
    });
    
    // Handle back button
    backBtn.addEventListener('click', () => {
        step2.classList.remove('active');
        step1.classList.add('active');
        verifyTokenInput.value = '';
        hideMessages();
    });
    
    // Auto-format token input
    verifyTokenInput.addEventListener('input', (e) => {
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

