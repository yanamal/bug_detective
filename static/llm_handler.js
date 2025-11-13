// ~~~~ Functions that make LLM calls for "interaction-style" steps/questions ~~~~

function start_problem_statement_check(prob, unit_test, student_output, correct_output){
    // first, make sure the understanding check exists (it may not if this step is "conversational)
    if($('[data-step-name="observation"] .understanding_check').length === 0){
        return;
    }

    // remove initial fade in animation from problem statement so we can mess with its classes
    $('.problem-statement').removeClass('animate-fade-in')

    // draw arrow from understanding check text to problem statement
    // (and activate problem statement)
    // TODO: use more precise selector? (specify observation)

    drawTransientArrow(
        document.querySelector('.understanding_check .arrow-start'),
        document.querySelector('.problem-statement')
    )

    // activate "click on problem statement segment" logic
    $('#problem_statement_div>span').click(function(){
        pieces = $('#problem_statement_div>span').map(function(){return $(this).text()}).get()
        expected_answer = $('#problem_statement_div>.expected').text()

        console.log($(this).text())
        fetch('/api/problem_statement_feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(addIdentifier({
                problem_statement: prob,
                problem_statement_pieces: pieces,
                unit_test: unit_test,
                student_output: student_output,
                correct_output: correct_output,
                expected_answer: expected_answer,
                clicked_piece: $(this).text()
            }))
        })
        .then(response => {
            if(response.ok){
                return response.json()
            }
            else {
                $('#error_dialog').dialog('open');
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

        })
        .then(data => {
            // Feedback loaded - show it, and proceed to next step if necessary
            console.log(data)
            feedback_text = data.results.problem_feedback_data.step1_feedback_to_student
            should_try_again = data.results.problem_feedback_data.step2_asked_to_try_again
            $('#step1_check_feedback').append(marked.parse(feedback_text)+'<br>')

            if(!should_try_again) {
                // the model told us we are done with this step.
                // turn on next step button
                $('[data-step-name="observation"] .next-button').removeClass('hidden')
                // remove active class from problem statement (added by arrow drawing logic)
                $('.problem-statement').removeClass('active-check')
                // remove click listener
                $('#problem_statement_div>span').off('click');
            }
        })
    });
}

function start_exception_check(prob, unit_test, student_output, correct_output){
    // first, make sure the understanding check exists (it may not if this step is "conversational)
    if($('[data-step-name="observation"] .understanding_check').length === 0){
        return;
    }

    // draw arrow from understanding check text to exception text
    // (and activate exception text)
    // TODO: use more precise selector? (specify observation)
    drawTransientArrow(
        document.querySelector('.understanding_check .arrow-start'),
        document.querySelector('.student-output-text')
    )

    // activate "click on segment" logic
    $('.student-output-text>span').click(function(){
        pieces = $('.student-output-text>span').map(function(){return $(this).text()}).get()
        expected_answers = $('.student-output-text').data('expected_click')
        question = $('[data-step-name="observation"] .understanding-check-text').text()

        fetch('/api/exception_feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(addIdentifier({
                problem_statement: prob,
                exception_pieces: pieces,
                unit_test: unit_test,
                student_output: student_output,
                correct_output: correct_output,
                expected_answers: expected_answers,
                exception_question: question,
                clicked_piece: $(this).text()
            }))
        })
        .then(response => {
            if(response.ok){
                return response.json()
            }
            else {
                $('#error_dialog').dialog('open');
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

        })
        .then(data => {
            // Feedback loaded - show it, and proceed to next step if necessary
            console.log(data)
            feedback_text = data.results.exception_feedback_data.step1_feedback_to_student
            should_try_again = data.results.exception_feedback_data.step2_asked_to_try_again
            $('#step1_check_feedback').append(marked.parse(feedback_text)+'<br>')

            if(!should_try_again) {
                // the model told us we are done with this step.
                // turn on next step button
                $('[data-step-name="observation"] .next-button').removeClass('hidden')
                // remove active class from problem statement (added by arrow drawing logic)
                $('.student-output-text').removeClass('active-check')
                // remove click listener
                $('.student-output-text>span').off('click');
            }

        })
    })
}

function start_direction_check(){
    // first, make sure the understanding check exists (it may not if this step is "conversational)
    if($('[data-step-name="direction"] .understanding_check').length === 0){
        return;
    }

    // start logic for asking the understanding question in step 2(direction)
    // activate "understanding check" question
    $('[data-step-name="direction"] .understanding_check').addClass('active')

    // scroll slider into view before drawing arrow to it (doing it in drawTransientArrow right now)
    //$('#trace-slider-correction')[0].scrollIntoView() //({behavior:'smooth'})

    // draw arrow from understanding check text to exception text
    // (and activate exception text)
    drawTransientArrow(
        document.querySelector('[data-step-name="direction"] .understanding_check .arrow-start'),
        document.querySelector('.ui-slider-handle')
    )

    $('#follow_slider').removeClass('hidden')
    $('.trace-slider').slider("value", $('.trace-slider').slider("value"));
}

function start_action_check(){
// first, make sure the understanding check exists (it may not if this step is "conversational)
    if($('[data-step-name="action"] .understanding_check').length === 0){
        return;
    }

    // deactivate 'active-check' on slider handle (TODO: do after check finishes?)
    $('.ui-slider-handle').removeClass('active-check')

    // activate understanding check
    $('[data-step-name="action"] .understanding_check').addClass('active')

    // activate arrows pointing at the slice, and start check for asking the student to explain what's going wrong
    drawTransientArrow(
        document.querySelector('#action-text'),
        document.querySelector('.first-selected-tick'),
        path="grid"
    )
    drawTransientArrow(
        document.querySelector('#action-text'),
        document.querySelector('.last-selected-tick'),
        path="grid"
    )

}

function request_explanation_feedback(){
    let explanation = $('#student-explanation').val()

    let prob = $('#problem_statement_div').text() // problem_statement || ""

    let unit_test = correction_data['unit_test_string']

    // TODO: or just use correction_data['source_string'] and correction_data['dest_string']
    let student_code_block = $('#before_block').clone()
    student_code_block.find('.value').remove()
    let student_code = student_code_block.text()

    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()

    descriptive_synced_trace = descriptive_trace
    let student_descriptive_trace = []
    let orig_indices = []
    for(let i=0; i<descriptive_synced_trace.length; i++)
    {
        if(descriptive_synced_trace[i].before !== null) {
            student_descriptive_trace.push(descriptive_synced_trace[i].before)
            orig_indices.push(i)
        }
    }

    let observation = $('#observation-text').text()
    let direction = $('#direction-text').text()
    let action = $('#action-text').text()

    return fetch('/api/explanation_feedback', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(addIdentifier({
            problem_statement: prob,
            student_code: student_code,
            unit_test: unit_test,
            student_output: student_output,
            execution_trace: student_descriptive_trace,
            observation: observation,
            direction: direction,
            action: action,
            student_explanation: explanation
        }))
    })
    .then(response => {
        if(response.ok){
            return response.json()
        }
        else {
            $('#error_dialog').dialog('open');
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

    })
    .then(data => {
        console.log(data)
        $('#step3_check_feedback').html(marked.parse(data.results.explanation_feedback_data.step1_feedback_to_student))
        if(data.results.explanation_feedback_data.step2_student_explained_sufficiently){
            $('#sufficient_explanation').removeClass('hidden');
            send_logs();

            $('explanation_question_span').addClass('hidden');
            $('#improve_explanation').addClass('hidden');
        }
        else{
            $('#sufficient_explanation').addClass('hidden');
            $('#improve_explanation').removeClass('hidden');
        }
    })

}

function request_exception_check(){
    // request content for a question about the exception (if there was an exception):
    // split exeption message into parts, choose trickiest part, ask a question about it.

    // TODO: only call this after explanation is loaded, and give the explanation to the question generator?

    let prob = $('#problem_statement_div').text() // problem_statement || ""
    let unit_test = correction_data['unit_test_string']
    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()

    // TODO: replace existing problem statement question with loading div?

    // Send AJAX request
    return fetch('/api/exception_understanding_question', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(addIdentifier({
            problem_statement: prob,
            unit_test: unit_test,
            student_output: student_output
        }))
    })
    .then(response => {
        if(response.ok){
            return response.json()
        }
        else {
            $('#error_dialog').dialog('open');
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

    })
    .then(data => {
        console.log(data)

        let exception_spans = ''
        let correct_answers = []
        for(let i=0; i < data.results.exception_check_data.step3_exception_split_into_substrings.length; i++) {
            console.log(data.results.exception_check_data.step3_exception_split_into_substrings[i]['exception_substring'])
            exception_spans += `<span>${data.results.exception_check_data.step3_exception_split_into_substrings[i]['exception_substring']}</span>`
            if(data.results.exception_check_data.step3_exception_split_into_substrings[i]['is_correct_answer']){
                correct_answers.push(data.results.exception_check_data.step3_exception_split_into_substrings[i]['exception_substring'])
            }
        }
        // replace exception message (in output field) with the split-up version
        // const wrappedParts = data.results.exception_check_data.step3_exception_split_into_substrings.map(part => `<span>${part}</span>`);
        $('.student-output-text').html(exception_spans);
        $('.student-output-text').data('expected_click', correct_answers)
        $('[data-step-name="observation"] .understanding-check-text').html(marked.parse(data.results.exception_check_data.step2_question_for_student))
    })
}

// make a request to the server to generate an Observation step message; put it in the expected place on the page once it's generated
function request_observation() {
    const obs_request_params = {
        problem_statement: $('#problem_statement_div').text(),
        student_code: correction_data['source_string'],
        corrected_code: correction_data['dest_string'],
        unit_test: correction_data['unit_test_string'],
        student_output: correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString(),
        correct_output: correction_data['synced_trace'].findLast((t)=>t['after'])['after']['values'].toString()
    };

    // Send AJAX request
    return fetch('/api/observation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(addIdentifier(obs_request_params))
    })
    .then(response => {
        if(response.ok){
            return response.json()
        }
        else {
            $('#error_dialog').dialog('open');
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

    })
    .then(data => {
        // Process and display generated observation step
        console.log(data.candidate_observations)
        console.log(data.candidate_evaluation)

        // display observation step
        $('#observation-text').html(marked.parse(data.observation))
        $('#observation-text').removeClass()  // no longer loading

        // set up revealing the understanding check
        $('[data-step-name="observation"] .understanding_check').addClass('active')

        // start understanding check: exception or problem statement, depending on type of output.
        if (obs_request_params.student_output.startsWith('Exception:')) {
            start_exception_check(obs_request_params.problem_statement,
                                  obs_request_params.unit_test,
                                  obs_request_params.student_output,
                                  obs_request_params.correct_output)
        } else {
            start_problem_statement_check(obs_request_params.problem_statement,
                                          obs_request_params.unit_test,
                                          obs_request_params.student_output,
                                          obs_request_params.correct_output)
        }

        // return generated step output so far
        return {
            observation: data.observation
        }
    })
}

function request_direction(previous_output = {}) {
    const direction_request_params = {
        problem_statement: $('#problem_statement_div').text(),
        student_code: correction_data['source_string'],
        corrected_code: correction_data['dest_string'],
        unit_test: correction_data['unit_test_string'],
        student_output: correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString(),
        correct_output: correction_data['synced_trace'].findLast((t)=>t['after'])['after']['values'].toString(),
        observation: previous_output.observation
    };


    // Send AJAX request
    return fetch('/api/direction', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(addIdentifier(direction_request_params))
    })
    .then(response => {
        if(response.ok){
            return response.json()
        }
        else {
            $('#error_dialog').dialog('open');
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

    })
    .then(directionData => {
        // Process and display generated direction step
        $('#direction-text').html(marked.parse(directionData.direction))
        $('#direction-text').removeClass()

        console.log(directionData.direction_candidates)
        console.log(directionData.candidate_evaluation)

        // return generated step output so far
        previous_output.direction = directionData.direction
        return previous_output;
    })
}

function request_diagnostics(){
    // extract problem data and request diagnostic messages (looks like..., I wonder...)
    let prob = $('#problem_statement_div').text() // problem_statement || ""

    let unit_test = correction_data['unit_test_string']

    // TODO: or just use correction_data['source_string'] and correction_data['dest_string'] - if it's guaranteed to be canonicalized in the same way?
    let student_code_block = $('#before_block').clone()
    student_code_block.find('.value').remove()
    let student_code = student_code_block.text()

    let corrected_code_block = $('#after_block').clone()
    corrected_code_block.find('.value').remove()
    let corrected_code = corrected_code_block.text()

    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()

    let correct_output = correction_data['synced_trace'].findLast((t)=>t['after'])['after']['values'].toString()

    console.log(prob)
    console.log(student_code)
    console.log(corrected_code)
    console.log(unit_test)
    console.log(student_output)

    // Create the common request parameters object
    const requestParams = {
        problem_statement: prob,
        student_code: student_code,
        corrected_code: corrected_code,
        unit_test: unit_test,
        student_output: student_output
    };

    // variables for storing priming and observation, to return with the direction
    let priming_result;
    let observation_result;

    // Send AJAX request
    return fetch('/api/observation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(addIdentifier(requestParams))
    })
    .then(response => {
        if(response.ok){
            return response.json()
        }
        else {
            $('#error_dialog').dialog('open');
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

    })
    .then(data => {
        console.log(data.candidate_observations)
        console.log(data.candidate_evaluation)

        // display observation step
        $('#observation-text').html(marked.parse(data.observation))
        $('#observation-text').removeClass()  // no longer loading

        // set up revealing the understanding check
        $('[data-step-name="observation"] .understanding_check').addClass('active')

        // start understanding check: exception or problem statement, depending on type of output.
        if(student_output.startsWith('Exception:')){
            start_exception_check(prob, unit_test, student_output, correct_output)
        }
        else {
            start_problem_statement_check(prob, unit_test, student_output, correct_output)
        }



        // Store variables for later stages (TODO: we don't have/need a priming result anymore)
        observation_result = data.observation
        priming_result = data.priming

        // fetch the next step - investigation direction
        return fetch('/api/direction', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(addIdentifier({
                ...requestParams,
                chat_history: data.chat_history || [] // TODO: we don't have/need chat history anymore
            }))
        });
    })
    .then(response => {
        if(response.ok){
            return response.json()
        }
        else {
            $('#error_dialog').dialog('open');
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

    })
    .then(directionData => {
        // "what should we look into?"
        $('#direction-text').html(marked.parse(directionData.direction))
        $('#direction-text').removeClass()

        console.log(directionData.direction_candidates)
        console.log(directionData.candidate_evaluation)

        output_data = {
            direction: directionData.direction,
            priming: priming_result,
            observation: observation_result
        }
        console.log(output_data)

        // Return combined results
        return output_data;
    })
}

function request_direction_question(diagnostic_responses, descriptive_synced_trace){
    let prob = problem_statement || ""

    let unit_test = correction_data['unit_test_string']

    let corrected_code_block = $('#after_block').clone()
    corrected_code_block.find('.value').remove()
    let corrected_code = corrected_code_block.text()

    let student_code_block = $('#before_block').clone()
    student_code_block.find('.value').remove()
    let student_code = student_code_block.text()

    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()

    student_descriptive_trace = []
    orig_indices = []
    for(let i=0; i<descriptive_synced_trace.length; i++)
    {
        if(descriptive_synced_trace[i].before !== null) {
            student_descriptive_trace.push(descriptive_synced_trace[i].before)
            orig_indices.push(i)
        }
    }

    return fetch('/api/direction_understanding_question', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(addIdentifier({
            problem_statement: prob,
            student_code: student_code,
            corrected_code: corrected_code,
            unit_test: unit_test,
            student_output: student_output,
            execution_trace: student_descriptive_trace,
            direction: diagnostic_responses.direction
        }))
    })
    .then(response => {
        if(response.ok){
            return response.json()
        }
        else {
            $('#error_dialog').dialog('open');
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

    })
    .then(data => {
        console.log(data)
        $('[data-step-name="direction"] .understanding-check-text').removeClass('loading-placeholder')
        $('[data-step-name="direction"] .understanding-check-text').removeClass('loading-line')
        $('[data-step-name="direction"] .understanding-check-text').html(marked.parse(data.results.direction_question.step1_question))
        // attach data about question and answers to the slider for selecting the answer
        $('#follow_slider').data('direction_question', data.results.direction_question.step1_question)
        $('#follow_slider').data('direction_answers', data.results.direction_question.step2_valid_answers)
    });

}

function request_direction_feedback(){
    let prob = problem_statement || ""

    let unit_test = correction_data['unit_test_string']

    let corrected_code_block = $('#after_block').clone()
    corrected_code_block.find('.value').remove()
    let corrected_code = corrected_code_block.text()

    let student_code_block = $('#before_block').clone()
    student_code_block.find('.value').remove()
    let student_code = student_code_block.text()

    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()

    let student_descriptive_trace = []
    let orig_indices = []
    for(let i=0; i<descriptive_trace.length; i++)
    {
        if(descriptive_trace[i].before !== null) {
            student_descriptive_trace.push(descriptive_trace[i].before)
            orig_indices.push(i)
        }
    }
    let orig_to_student = {}
    for(let i=0; i<orig_indices.length; i++){
        orig_to_student[orig_indices[i]] = i
    }


    let question = $('#follow_slider').data('direction_question')
    let correct_answers = $('#follow_slider').data('direction_answers')

    let current_op_index = $('.trace-slider').slider("option", "value");
    let trace_to_use =  $('.comparison-div').hasClass('full-view')?descriptive_trace:student_descriptive_trace
    let current_op = trace_to_use[current_op_index]
    //calculate the student trace index from whatever we are currently using in the interface
    let student_trace_index = $('.comparison-div').hasClass('full-view')?orig_to_student[current_op_index]: current_op_index


    return fetch('/api/direction_feedback', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(addIdentifier({
            problem_statement: prob,
            student_code: student_code,
            corrected_code: corrected_code,
            unit_test: unit_test,
            student_output: student_output,
            execution_trace: student_descriptive_trace,
            direction: $('#direction-text').text(),
            question: question,
            chosen_index: student_trace_index,
            chosen_step: current_op,
            correct_answers: correct_answers
        }))
    })
    .then(response => {
        if(response.ok){
            return response.json()
        }
        else {
            $('#error_dialog').dialog('open');
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

    })
    .then(data => {
        console.log(data)

        feedback_text = data.results.direction_feedback_data.step1_feedback_to_student
        should_try_again = data.results.direction_feedback_data.step2_asked_to_try_again
        $('#step2_check_feedback').append(marked.parse(feedback_text)+'<br>')

        if(!should_try_again) {
            // the model told us we are done with this step.
            // turn on next step button
            $('[data-step-name="direction"] .next-button').removeClass('hidden')
            // remove active class from problem statement (added by arrow drawing logic)
            $('.ui-slider-handle').removeClass('active-check')

            $('#follow_slider').addClass('hidden')
        }

    })
}

// ~~~~ Functions for getting trace step descriptions ~~~~

let descriptive_trace = []; // variable to globally store descriptive synced trace (with code context, not bytecode) when it's ready

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
        body: JSON.stringify(addIdentifier({
            synced_trace: synced_trace,
            problem_statement: prob,
            unit_test: unit_test,
            corrected_code: corrected_code,
            student_code: student_code
        }))
    })
    .then(response => {
        if(response.ok){
            return response.json()
        }
        else {
            $('#error_dialog').dialog('open');
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

    })
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
}

// request selection of a relevant *slice* of the trace
function request_trace_slice(diagnostic_responses, descriptive_synced_trace){
    let prob = problem_statement || ""

    let unit_test = correction_data['unit_test_string']

    let corrected_code_block = $('#after_block').clone()
    corrected_code_block.find('.value').remove()
    let corrected_code = corrected_code_block.text()

    let student_code_block = $('#before_block').clone()
    student_code_block.find('.value').remove()
    let student_code = student_code_block.text()

    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()

    student_descriptive_trace = []
    orig_indices = []
    for(let i=0; i<descriptive_synced_trace.length; i++)
    {
        if(descriptive_synced_trace[i].before !== null) {
            student_descriptive_trace.push(descriptive_synced_trace[i].before)
            orig_indices.push(i)
        }
    }

    console.log(descriptive_synced_trace)
    console.log(student_descriptive_trace)



    return fetch('/api/trace_slice', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(addIdentifier({
            student_trace: student_descriptive_trace,
            problem_statement: prob,
            unit_test: unit_test,
            corrected_code: corrected_code,
            student_code: student_code,
            student_output: student_output,
            // diagnostic_reasoning: diagnostic_responses.priming,
            observation: diagnostic_responses.observation,
            direction: diagnostic_responses.direction
        }))
    })
    .then(response => {
        if(response.ok){
            return response.json()
        }
        else {
            $('#error_dialog').dialog('open');
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

    })
    .then(data => {
        console.log(data)

        // mark the indicated trace steps
        for(let i=data.results.slice_data.start_index; i <= data.results.slice_data.end_index; i++ ){
            $(`.tick[data-synced-index="${orig_indices[i]}"]`).addClass('selected-tick')
        }

        $(`.tick[data-synced-index="${orig_indices[data.results.slice_data.start_index]}"]`).addClass('first-selected-tick')
        $(`.tick[data-synced-index="${orig_indices[data.results.slice_data.end_index]}"]`).addClass('last-selected-tick')


        // "let's investigate!"
        $('#action-text').html(marked.parse(data.results.slice_data.student_call_to_action))
        $('#action-text').removeClass('loading-line')
        $('#action-text').removeClass('loading-placeholder')
        // add_step(`<h4>Step 4. Let's investigate!</h4><div> ${marked.parse(data.results.slice_data.student_call_to_action)} </div>`)
        //$('#conversation_div').append(`<div class="explanation"><h4>Step 4. Let's investigate!</h4><div> ${marked.parse(data.results.slice_data.student_call_to_action)} </div></div>`)

    })
    .catch(error => {
        console.error('Error:', error);
    });

}

// ~~~~ Functions for "conversation-style" steps/questions

function request_chat_response(step_name, chat_history,
    message_box_selector, conversation_div_selector, input_div_selector,
    api_endpoint, finish_resolve_func=null, previous_output={}) {
    // Generic function for continuing a conversation within a specific step.

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
    // clear message box
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
        body: JSON.stringify(addIdentifier({
            problem_statement: prob,
            unit_test: unit_test,
            student_output: student_output,
            chat_history: chat_history,
            student_code: student_code,
            execution_trace: student_descriptive_trace
        }))
    })
    .then(response => {
        if(response.ok){
            return response.json()
        }
        else {
            $('#error_dialog').dialog('open');
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

    })
    .then(data => {
        console.log(data)

        let response = data.results.response_data.step3_response_to_student

        // append response to conversation div
        $(conversation_div_selector).append(`<div class='tutor'>${marked.parse(response)}<div>`)

        // append response to chat history
        chat_history.push({
            "role": "model",
            "parts": [{text: response}]
        })

        if(data.results.response_data.step2_has_question_been_answered){
            //end conversation
            $(`[data-step-name="${step_name}"] .next-button`).removeClass('hidden')

            $(input_div_selector).addClass('hidden')

            // is there a manual resolve function we need to call when the conversation is over, in order to trigger logic for the next step?
            // if so, resolve it.
            // TODO: actually, also take the previous output data that was passed through and add this step's response?..
            if(finish_resolve_func) {
                // turn previous output into current output (add output of this step)
                previous_output[step_name] = response
                finish_resolve_func(previous_output)
            }
        }

        // return response
    })
}

function request_observation_response(chat_history, finish_resolve_func){
    // This is called when the student presses "send" with a message to the step 1 (observation) assistant.

    return request_chat_response('observation', chat_history,
        '#student-observation-box', '#observation-conversation', '#student-observation-input',
        '/api/observation_convo', finish_resolve_func) // no previous output - observation is always the first step
}

function request_direction_response(chat_history, finish_resolve_func, prev_output){
    return request_chat_response('direction', chat_history,
        '#student-direction-box', '#direction-conversation', '#student-direction-input',
    '/api/direction_convo', finish_resolve_func, prev_output)
}

function request_action_response(chat_history, finish_resolve_func, prev_output){
    return request_chat_response('action', chat_history,
        '#student-action-box', '#action-conversation', '#student-action-input',
        '/api/action_convo', finish_resolve_func, prev_output
    )
}

