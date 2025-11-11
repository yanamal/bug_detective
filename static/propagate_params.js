propagation_params = [
    'identifier',
    'version'
]

// Extract identifier from URL parameters (if present) to include in API requests
const urlParams = new URLSearchParams(window.location.search);
const clientIdentifier = urlParams.get('identifier');

// Helper function to conditionally add identifier to request body
function addIdentifier(body) {
    if (clientIdentifier) {
        return { ...body, identifier: clientIdentifier };
    }
    return body;
}

// Propagate any existing propagation_params to all /sequence links
// (assumes that sequence links already exist in DOM!
function propagate_sequence_params(){
    //const urlParams = new URLSearchParams(window.location.search);

    // Pass along each parameter, if it exists
    for(let param of propagation_params) {
        let param_value = urlParams.get(param)
        if(param_value) {
            document.querySelectorAll('a[href^="/sequence?"]').forEach(link => {
                const currentHref = link.getAttribute('href');
                link.setAttribute('href', `${currentHref}&${param}=${encodeURIComponent(param_value)}`);
            });
        }
    }
}