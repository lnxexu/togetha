from rest_framework.views import exception_handler

def custom_exception_handler(exc, context):
    """Custom exception handler for better error messages"""
    response = exception_handler(exc, context)
    
    if response is None:
        return response
    
    if response.status_code == 401:
        request = context.get('request')
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        
        response.data = {
            'error': 'Authentication failed. Please provide valid credentials.',
            'detail': str(exc),
            'auth_header_present': bool(auth_header)
        }
        
        # Add debugging info
        if not auth_header:
            response.data['help'] = 'Make sure to include Authorization: Token <your-token> header'
    
    return response


def get_authenticated_user(request):
    """
    Helper function to get authenticated user from request.
    Returns None if user is not authenticated.
    
    This centralizes the authentication check pattern used across views.
    """
    return request.user if hasattr(request, 'user') and request.user.is_authenticated else None