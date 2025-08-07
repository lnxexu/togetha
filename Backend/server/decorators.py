from functools import wraps
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.response import Response
from rest_framework import status

def api_auth_required(methods=None):
    if methods is None:
        methods = ['GET']
        
    def decorator(view_func):
        @wraps(view_func)
        @api_view(methods)
        @authentication_classes([TokenAuthentication, SessionAuthentication])
        @permission_classes([IsAuthenticated])
        def wrapped_view(request, *args, **kwargs):
            return view_func(request, *args, **kwargs)
        return wrapped_view
    return decorator