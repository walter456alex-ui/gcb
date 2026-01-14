// Dashboard functionality
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    const userName = document.getElementById('userName');
    const displayName = document.getElementById('displayName');
    const staffID = document.getElementById('staffID');
    const department = document.getElementById('department');
    const email = document.getElementById('email');
    const timer = document.getElementById('timer');
    
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    
    // Check session and load user data
    checkSession();
    
    // Set up session timer
    updateSessionTimer();
    setInterval(updateSessionTimer, 60000); // Update every minute
    
    // Set up activity monitoring
    let activityTimeout;
    document.addEventListener('mousedown', resetActivityTimeout);
    document.addEventListener('keypress', resetActivityTimeout);
    document.addEventListener('scroll', resetActivityTimeout);
    
    // Logout functionality
    logoutBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                window.location.href = '/login.html';
            }
        } catch (error) {
            console.error('Logout error:', error);
            // Force redirect even if API call fails
            window.location.href = '/login.html';
        }
    });
    
    async function checkSession() {
        try {
            const response = await fetch('/api/session');
            const data = await response.json();
            
            if (!data.authenticated) {
                if (data.timeout) {
                    alert('Your session has expired due to inactivity. Please log in again.');
                }
                window.location.href = '/login.html';
                return;
            }
            
            // Load user data
            if (data.user) {
                userName.textContent = data.user.fullName;
                displayName.textContent = data.user.fullName;
                staffID.textContent = data.user.staffID;
                department.textContent = data.user.department;
                email.textContent = data.user.email;
            }
            
        } catch (error) {
            console.error('Session check error:', error);
            window.location.href = '/login.html';
        }
    }
    
    function updateSessionTimer() {
        fetch('/api/session')
            .then(response => response.json())
            .then(data => {
                if (data.authenticated) {
                    // Calculate remaining time (simplified - in production, get actual expiry from server)
                    const remainingMinutes = 30; // This would come from server
                    timer.textContent = `${remainingMinutes} minutes`;
                }
            })
            .catch(error => {
                console.error('Timer update error:', error);
            });
    }
    
    function resetActivityTimeout() {
        clearTimeout(activityTimeout);
        
        activityTimeout = setTimeout(async () => {
            // Check session after inactivity
            const response = await fetch('/api/session');
            const data = await response.json();
            
            if (!data.authenticated || data.timeout) {
                alert('Your session has expired due to inactivity. Please log in again.');
                window.location.href = '/login.html';
            }
        }, SESSION_TIMEOUT);
    }
    
    // Initial activity timeout setup
    resetActivityTimeout();
    
    // Periodic session check
    setInterval(checkSession, 60000); // Check every minute
});

