from flask import Flask, render_template, request, jsonify, Blueprint
import os
import google.generativeai as genai
import json
from gemini_logger import generate_content_with_logging

question_bp = Blueprint('questions', __name__)


@question_bp.route('/api/direction_understanding_question', methods=['POST'])
def generate_direction_understanding_data():
    data = request.json
  
    # add index so the LLM has something concrete to return
    student_trace = data['execution_trace']
    for i in range(len(student_trace)):
        student_trace[i]['index'] = i

    model = genai.GenerativeModel('gemini-2.0-flash',
        system_instruction="""You are part of an educational system which assists beginner programmers in debugging their own Python code. Your task is to create content that will test the student's understanding of a previous suggestion made by the system."""
    )

    response_format = {
        "type": "object",
        "properties": {
            "step1_question": {
                "type": "string"
            },
            "step2_valid_answers": {
                "type": "array",
                "items": {
                    "type": "integer",
                }
            }
        }
    }

    response = generate_content_with_logging(model, request.endpoint, request.remote_addr, f'''
First, review the following information:

<problem_statement>
{data['problem_statement']}
</problem_statement>

<student_code>
{data['student_code']}
</student_code>

<unit_test>
{data['unit_test']}
</unit_test>

<student_output>
{data['student_output']}
</student_output>

<execution_trace>
{json.dumps(student_trace, indent=2)}
</execution_trace>

The system previously generated the following suggestion to the student; this suggestion describes which intermediate values and/or code paths they could investigate in order to understand the problem.
<investigation_suggestion>
{data['direction']}
</investigation_suggestion>

Your task is to create a question that tests the student's understanding of this suggetion. This question should take the form of asking the student to select a particular step in the execution trace that would be germane to the suggestion.

First, provide a student-facing question which starts with something like "Use the trace slider to select a step...". Ensure that there is at least one step in the execution trace that would answer this question. The question should only describe what type of step the student should select, and should not add extraneous information or speculation like what the student will understand afterwards.

Then, provide a list of indices from the execution trace that are valid answers to this question.
''',
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema = response_format
        )
    )

    result = {
        "message": "direction question", 
        "results": {
            "input_data": data,
            "direction_question": json.loads(response.text)
        }
    }

    return jsonify(result)


@question_bp.route('/api/exception_understanding_question', methods=['POST'])
def generate_exception_understanding_data():
  data = request.json

  
  model = genai.GenerativeModel('gemini-2.0-flash',
    system_instruction="""You are part of an educational system which assists beginner programmers in debugging their own Python code. Your task is to analyze a runtime exception from a unit test and create content that will test the student's understanding of the error message."""
  )

  response_format = {
      "type": "object",
      "properties": {
        "step1_full_analysis": {
          "type": "string"
        },
        "step2_question_for_student": {
          "type": "string"
        },
        "step3_exception_split_into_substrings": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
                "exception_substring": {
                    "type": "string"
                },
                "is_correct_answer": {
                    "type": "boolean"
                }
            }
          }
        },
        # "step4_trickiest_part": {
        #   "type": "string"
        # },
      },
      "required": ["step1_full_analysis", "step2_question_for_student", "step3_exception_split_into_substrings"],
    }


  response = generate_content_with_logging(model, request.endpoint, request.remote_addr, f'''
First, review the following information:

<problem_statement>
{data['problem_statement']}
</problem_statement>

<unit_test>
{data['unit_test']}
</unit_test>

<student_output>
{data['student_output']}
</student_output>

Now, please follow these steps to generate the required output:

1. Analyze the exception message in the student_output.
2. Identify the trickiest part of the exception message for a beginner programmer to understand. This should be a concise, focused portion of the message that represents exactly one part of the core issue.
3. Split the entire exception message into several small, self-contained but meaningful substrings. Each substring must cover at most one aspect of the exception. One of these substrings MUST be the trickiest part you identified in step 2. Aim for 3-5 substrings in total. Together, these substrings should represent the entirety of the original exception message, including "Exception:".
4. Formulate a short, single-sentence question asking the student to click on a specific part of the exception message. The correct answer should be the trickiest part you identified. This question should **only** test the student's understanding of what the error message is saying, not what it might imply about the code.

<split_message_example>
[
  "Exception: ",
  "list indices ",
  "must be integers ",
  "or slices, "
  "not str"
]
</split_message_example>

Provide your thought process to ensure a thorough interpretation of the data. In your analysis, please include:

1. The exact exception message
2. A detailed analysis of the exception message, explaining its components
3. Split the message into 3-5 parts, numbering each part as you write it out. For each part, briefly explain why it was chosen and its significance, and consider why it might be tricky for a beginner
4. Based on your analysis of each part, explain which part you chose as the trickiest and why, considering a beginner's perspective
5. Write out 2-3 potential questions for the student, then choose the best one and explain your reasoning. Remember that this question is supposed to test the student's understanding of the error message, not ask them to speculate what it might imply about their code.


After your analysis, provide your output as a JSON object with the following fields:

- step1_full_analysis: Your detailed thought process and analysis, as described above
- step2_question_for_student: Your single-sentence question for the student
- step3_exception_split_into_substrings: An array of objects representing the split parts of the exception message; each object contains the substring(exception_substring) and a flag indicating whether this substring is a correct answer to the question(is_correct_answer).


Ensure that your output adheres to these guidelines:
- The trickiest part should be concise and focused, not the entire meaningful part of the exception message.
- One of the exception parts must be identical to the trickiest part.
- There should be 3-5 exception parts that each cover only one aspect of the exception. None of the parts should be empty or whitespace-only.
- When concatenated together, the exception parts should be equivalent to the entire original exception message.
- The student question should be short, usually one sentence, and should only ask the student what to click on without any extraneous information.

Remember to split the exception message into very granular parts.

''',
      generation_config=genai.GenerationConfig(
          response_mime_type="application/json",
          response_schema = response_format
      )
  )

  result = {
      "message": "exception check", 
      "results": {
          "input_data": data,
          "exception_check_data": json.loads(response.text)
      }
  }

  return jsonify(result)

