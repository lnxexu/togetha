
function setupAuthInterceptor() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        console.warn('No authentication token found');
        return;
    }
    
    // Override fetch to automatically include the token
    const originalFetch = window.fetch;
    
    window.fetch = function(url, options = {}) {
        // Create headers if they don't exist
        if (!options.headers) {
            options.headers = {};
        }
        
        // Only add the token for requests to our API
        if (url.startsWith('/') || url.includes(window.location.host)) {
            options.headers['Authorization'] = `Token ${token}`;
        }
        
        console.log(`Sending request to ${url} with auth token`);
        return originalFetch(url, options);
    };
    
    console.log('Auth interceptor initialized');
}

/**
 * Check if the token is valid
 * @returns {Promise<boolean>} True if token is valid
 */
function validateToken() {
    const token = localStorage.getItem('token');
    if (!token) {
        return Promise.resolve(false);
    }
    
    return fetch('/validate_token/', {
        headers: {
            'Authorization': `Token ${token}`
        }
    })
    .then(response => {
        if (response.ok) {
            return response.json().then(data => {
                return data.valid === true;
            });
        }
        // Token is invalid, remove it
        localStorage.removeItem('token');
        return false;
    })
    .catch(error => {
        console.error('Token validation error:', error);
        return false;
    });
}

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', function() {
    setupAuthInterceptor();
    
    // Optional: validate token on page load
    validateToken().then(valid => {
        if (!valid && !window.location.pathname.includes('login') && 
            !window.location.pathname.includes('signup')) {
            // Redirect to login if token is invalid and not already on login/signup page
            window.location.href = '/login_page/';
        }
    });
});