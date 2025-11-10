"""
Configuration settings for the Bug Detective application.
"""

# Identifier mode determines how client identifiers are obtained
# Options:
#   'x_real_ip' - Use X-Real-IP header (for PythonAnywhere and similar deployments)
#   'remote_addr' - Use Flask's request.remote_addr (standard IP address)
#   default behavior is same as 'remote_addr'
IDENTIFIER_MODE = 'remote_addr'
