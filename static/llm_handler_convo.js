function request_chat_response(step_name, chat_history, 
    message_box_selector, conversation_div_selector, input_div_selector, 
    api_endpoint) {
    // Generic function for continuing a coversation within a specific step.

    // get inputs
    let prob = $('#problem_statement_div').text() // problem_statement || ""

    let unit_test = correction_data['unit_test_string']

    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()

    
    let student_code_block = $('#before_block').clone()
    student_code_block.find('.value').remove()
    let student_code = student_code_block.text()

        
    let student_descriptive_trace = []
    let orig_indices = []
    for(let i=0; i<descriptive_trace.length; i++)
    {
        if(descriptive_trace[i].before !== null) {
            student_descriptive_trace.push(descriptive_trace[i].before)
            orig_indices.push(i)
        }
    }


    let student_message = $(message_box_selector).val()
    // clear mesage box
    $(message_box_selector).val('')

    // append message to conversation div
    $(conversation_div_selector).append(`<div class='student'>${student_message}<div>`)

    // append message to conversation history
    chat_history.push({
        "role": "user",
        "parts": [{text: student_message}]
    })

    // request response
    return fetch(api_endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            problem_statement: prob,
            unit_test: unit_test,
            student_output: student_output,
            chat_history: chat_history,
            student_code: student_code,
            execution_trace: student_descriptive_trace
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log(data)

        response = data.results.response_data.step3_response_to_student

        // append response to conversation div
        $(conversation_div_selector).append(`<div class='tutor'>${marked.parse(response)}<div>`)

        // append response to chat history
        observation_chat_history.push({
            "role": "model",
            "parts": [{text: response}]
        })

        if(data.results.response_data.step2_has_question_been_answered){
            //end conversation
            $(`[data-step-name="${step_name}"] .next-button`).removeClass('hidden')
            
            $(input_div_selector).addClass('hidden')
        }

    })
}

function request_observation_response(){
    // This is called when the student presses "send" with a message to the step 1 (observation) assistant.

    return request_chat_response('observation', observation_chat_history, 
        '#student-observation-box', '#observation-conversation', '#student-observation-input', 
        '/api/observation_convo')
}


function request_direction_response(){
    return request_chat_response('direction', direction_chat_history, 
        '#student-direction-box', '#direction-conversation', '#student-direction-input',
    '/api/direction_convo')
}

function request_action_response(){
    return request_chat_response('action', action_chat_history, 
        '#student-action-box', '#action-conversation', '#student-action-input',
        '/api/action_convo'
    )
}

let descriptive_trace = [];
function request_full_trace_analysis() {
    
    let prob = problem_statement || ""

    let unit_test = correction_data['unit_test_string']

    let corrected_code_block = $('#after_block').clone()
    corrected_code_block.find('.value').remove()
    let corrected_code = corrected_code_block.text()

    let student_code_block = $('#before_block').clone()
    student_code_block.find('.value').remove()
    let student_code = student_code_block.text()

    let synced_trace = get_short_trace_info()['trace']

    console.log(synced_trace)

    
    return fetch('/api/full_trace_description', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            synced_trace: synced_trace,
            problem_statement: prob,
            unit_test: unit_test,
            corrected_code: corrected_code,
            student_code: student_code
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log(data)

        for(let i=0; i < data.results.trace_with_descs.length; i++) {
            if(correction_data.synced_trace[i].before){
                correction_data.synced_trace[i].before.description = data.results.trace_with_descs[i].before.description
            }
            if(correction_data.synced_trace[i].after){
                correction_data.synced_trace[i].after.description = data.results.trace_with_descs[i].after.description
            }
        }
        // TODO: scrub intent_description so the LLM doesn't get confused for subsequent steps?..
        descriptive_trace = data.results.trace_with_descs
        return data.results.trace_with_descs
    })
    .catch(error => {
        console.error('Error:', error);
    });

}
