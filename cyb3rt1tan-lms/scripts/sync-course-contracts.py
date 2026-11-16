"""Update BUILD-03 source DTOs and routes from bounded inputs, without loading the DB."""
import sys
from pathlib import Path
import yaml

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'api'))
from app import course_dto as dto

path = root.parent / 'master-kit (1)/contracts/core-api/openapi.yaml'
document = yaml.safe_load(path.read_text('utf-8'))
schemas = document['components']['schemas']
for name, model in [('CourseCreate', dto.CourseCreate), ('CoursePatch', dto.CoursePatch),
                    ('FacultyCreate', dto.FacultyCreate), ('FacultyPatch', dto.FacultyPatch),
                    ('AcademicTermCreate', dto.TermCreate), ('AcademicTermPatch', dto.TermPatch),
                    ('CourseStaffGrant', dto.StaffGrant), ('PermissionGrantRequest', dto.PermissionGrant),
                    ('EnrollmentRequest', dto.Enrollment), ('EnrollmentChangeRequest', dto.EnrollmentChange),
                    ('LessonPlanDraft', dto.Plan), ('TeachingSession', dto.SessionCreate),
                    ('TeachingSessionSeries', dto.SessionSeriesCreate),
                    ('TeachingSessionException', dto.SessionException),
                    ('GradeSchemeDraft', dto.GradeSchemeDraft),
                    ('CourseResourcesDraft', dto.CourseResources),
                    ('CourseRuleTemplateDraft', dto.TemplateDraft), ('CourseRuleOverridesDraft', dto.RulesDraft)]:
    schema = model.model_json_schema(ref_template='#/components/schemas/{model}')
    schemas.update(schema.pop('$defs', {}))
    schemas[name] = schema

def obj(properties, required=None):
    return {'type':'object','properties':properties,'required':list(properties) if required is None else required,'additionalProperties':False}
def ref(name): return {'$ref':'#/components/schemas/'+name}
def array(value): return {'type':'array','items':value}
string = {'type':'string'}
nullable = {'type':['string','null']}
integer = {'type':'integer','minimum':1}
schemas['CourseDetail'] = obj({'id':{'type':'string','format':'uuid'},'courseCode':string,'title':string,'facultyId':nullable,'termId':string,'timezone':string,'module':ref('Module'),'ownerId':{'type':'string','format':'uuid'},'status':{'type':'string','enum':['draft','active','completed','archived']},'revision':integer,'permissions':array(string)})
schemas['CourseList'] = obj({'items':array(ref('CourseDetail')),'nextCursor':nullable})
schemas['WorkspaceSummary']['properties']['courses'] = array(ref('CourseDetail'))
schemas['FacultyView'] = obj({'facultyId':string,'names':{'type':'object','additionalProperties':string},'sortOrder':{'type':'integer'},'status':string})
schemas['AcademicTermView'] = obj({'termCode':string,'name':string,'startsAt':{'type':'string','format':'date-time'},'endsAt':{'type':'string','format':'date-time'},'timezone':string,'status':string})
schemas['TeachingSessionView'] = obj({'id':string,'startsAt':{'type':'string','format':'date-time'},'endsAt':{'type':'string','format':'date-time'},'timezone':string,'sectionId':nullable,'room':nullable,'onlineUrl':nullable,'lessonPlanEntryId':nullable,'status':{'type':'string','enum':['scheduled','cancelled']},'recurrenceSeriesId':nullable,'recurrenceIndex':{'type':['integer','null'],'minimum':0,'maximum':51}})
schemas['LessonPlanView'] = obj({'entries':array(ref('PlanEntry')),'revision':integer})
schemas['CourseRuleTemplateView'] = obj({'id':nullable,'version':{'type':'integer','minimum':0},'rules':array(ref('Rule')),'active':{'type':'boolean'}})
schemas['EffectiveCourseRules'] = obj({'templateVersion':{'type':'integer','minimum':0},'revision':integer,'rules':array({'allOf':[ref('Rule'),{'type':'object','properties':{'source':{'type':'string','enum':['shared','override','custom']}}}]}),'sharedRules':array(ref('Rule')),'customRules':array(ref('Rule')),'overrides':schemas['CourseRuleOverridesDraft']['properties']['overrides']})
schemas['EffectiveCourseRules']['properties']['publicationVersion'] = {'type':'integer','minimum':0}
# Source rule input remains strict; effective response adds a server-owned source field.
schemas['EffectiveCourseRules']['properties']['rules'] = array(obj({**schemas['Rule']['properties'],'source':{'type':'string','enum':['shared','override','custom']}}))

def response(schema): return {'description':'Implemented BUILD-03 response.','content':{'application/json':{'schema':schema}}}
for route, methods in document['paths'].items():
    if route == '/courses':
        methods['get']['responses']['200']=response(ref('CourseList'))
        methods['post']['responses']['201']=response(ref('CourseDetail'))
    elif route == '/courses/{courseId}':
        for method in ['get','patch']: methods[method]['responses']['200']=response(ref('CourseDetail'))
    elif route == '/courses/{courseId}/lesson-plan':
        for method in ['get','put']: methods[method]['responses']['200']=response(ref('LessonPlanView'))
    elif route == '/courses/{courseId}/rules':
        for method in ['get','put']: methods[method]['responses']['200']=response(ref('EffectiveCourseRules'))
    elif route == '/courses/{courseId}/sessions':
        methods['get']['responses']['200']=response(obj({'items':array(ref('TeachingSessionView'))}))
        methods['post']['responses']['201']=response(ref('TeachingSessionView'))

document['paths']['/courses/{courseId}/session-series'] = {
 'parameters':[{'$ref':'#/components/parameters/CourseId'}],
 'post':{'operationId':'createRecurringTeachingSessions','tags':['Courses'],
 'summary':'Create a bounded recurring series in the course timezone',
 'parameters':[{'$ref':'#/components/parameters/IfMatch'}],
 'requestBody':{'required':True,'content':{'application/json':{'schema':ref('TeachingSessionSeries')}}},
 'responses':{'201':response(obj({'seriesId':string,'items':array(ref('TeachingSessionView'))})),
 '409':{'$ref':'#/components/responses/Conflict'},'422':{'$ref':'#/components/responses/ValidationFailure'}}}}
document['paths']['/courses/{courseId}/sessions/{sessionId}'] = {
 'parameters':[{'$ref':'#/components/parameters/CourseId'},
 {'name':'sessionId','in':'path','required':True,'schema':{'type':'string','format':'uuid'}}],
 'patch':{'operationId':'recordTeachingSessionException','tags':['Courses'],
 'summary':'Cancel, reschedule, or change the room for one session',
 'parameters':[{'$ref':'#/components/parameters/IfMatch'}],
 'requestBody':{'required':True,'content':{'application/json':{'schema':ref('TeachingSessionException')}}},
 'responses':{'200':response(ref('TeachingSessionView')),
 '404':{'$ref':'#/components/responses/NotFound'},'409':{'$ref':'#/components/responses/Conflict'},
 '422':{'$ref':'#/components/responses/ValidationFailure'}}}}
schemas['GradeSchemeView'] = obj({'id':nullable,'version':{'type':'integer','minimum':0},'components':array(ref('GradeComponent')),'bands':array(ref('GradeBand')),'active':{'type':'boolean'}})
schemas['CourseGradeSchemeList'] = obj({'active':ref('GradeSchemeView'),'items':array(ref('GradeSchemeView'))})
schemas['CourseResourceView'] = obj({'id':{'type':'string','format':'uuid'},**schemas['CourseResource']['properties']})
schemas['CourseResourcesView'] = obj({'items':array(ref('CourseResourceView')),'revision':integer})
schemas['EffectiveCourseRule'] = obj({**schemas['Rule']['properties'],'source':{'type':'string','enum':['shared','override','custom']}})
document['paths']['/courses/{courseId}/grade-schemes'] = {
 'parameters':[{'$ref':'#/components/parameters/CourseId'}],
 'get':{'operationId':'listGradeSchemes','tags':['Courses'],'summary':'List immutable grade scheme versions for a course',
 'responses':{'200':response(ref('CourseGradeSchemeList')),'403':{'$ref':'#/components/responses/Forbidden'}}},
 'post':{'operationId':'createGradeScheme','tags':['Courses'],'summary':'Create a course grade scheme draft',
 'parameters':[{'$ref':'#/components/parameters/IfMatch'}],
 'requestBody':{'required':True,'content':{'application/json':{'schema':ref('GradeSchemeDraft')}}},
 'responses':{'201':response(ref('GradeSchemeView')),'422':{'$ref':'#/components/responses/ValidationFailure'}}}}
document['paths'].pop('/admin/grade-schemes', None)
document['paths'].pop('/admin/grade-schemes/{schemeId}/activate', None)
document['paths']['/courses/{courseId}/grade-schemes']['get']['responses']['200'] = response(ref('CourseGradeSchemeList'))
document['paths']['/courses/{courseId}/grade-schemes']['post']['parameters'] = [
 {'$ref':'#/components/parameters/IfMatch'}]
document['paths']['/courses/{courseId}/grade-schemes']['post']['responses']['201'] = response(ref('GradeSchemeView'))
document['paths']['/courses/{courseId}/grade-schemes/{schemeVersionId}/publish']['post']['parameters'] = [
 {'$ref':'#/components/parameters/IfMatch'}]
document['paths']['/courses/{courseId}/grade-schemes/{schemeVersionId}/publish']['post']['responses'] = {
 '202':response(ref('GradeSchemeView')),'404':{'$ref':'#/components/responses/NotFound'},
 '409':{'$ref':'#/components/responses/Conflict'},'422':{'$ref':'#/components/responses/ValidationFailure'}}
document['paths']['/courses/{courseId}/resources'] = {
 'parameters':[{'$ref':'#/components/parameters/CourseId'}],
 'get':{'operationId':'listCourseResources','tags':['Courses'],'summary':'List course learning resources, useful links and required software',
 'responses':{'200':response(ref('CourseResourcesView'))}},
 'put':{'operationId':'replaceCourseResources','tags':['Courses'],'summary':'Replace the bounded course resource list',
 'parameters':[{'$ref':'#/components/parameters/IfMatch'}],
 'requestBody':{'required':True,'content':{'application/json':{'schema':ref('CourseResourcesDraft')}}},
 'responses':{'200':response(ref('CourseResourcesView')),'409':{'$ref':'#/components/responses/Conflict'},'422':{'$ref':'#/components/responses/ValidationFailure'}}}}
document['paths']['/courses/{courseId}/grade-scheme'] = {
 'parameters':[{'$ref':'#/components/parameters/CourseId'}],
 'get':{'operationId':'getCourseGradeScheme','tags':['Courses'],'summary':'Read the current immutable grade scheme version for a course',
 'responses':{'200':response(ref('GradeSchemeView'))}}
}
document['paths']['/courses/{courseId}/rules/history'] = {
 'parameters':[{'$ref':'#/components/parameters/CourseId'}],
 'get':{'operationId':'listEffectiveCourseRuleHistory','tags':['Courses'],'summary':'Read bounded immutable effective Course Rules publications',
 'parameters':[{'name':'before','in':'query','schema':{'type':'integer','minimum':1}}],
 'responses':{'200':response(obj({
     'items':array(obj({
         'version':integer,
         'templateVersion':{'type':'integer','minimum':0},
         'publishedAt':{'type':'string','format':'date-time'},
         'rules':array(ref('EffectiveCourseRule')),
     })),
     'nextBefore':{'type':['integer','null']},
 }))}}
}

document['paths']['/courses/{courseId}/people'] = {
 'parameters':[{'$ref':'#/components/parameters/CourseId'}],
 'get':{'operationId':'searchCourseEligiblePeople','tags':['Courses'],'summary':'Owner/Admin searches bounded active account candidates without email or credentials',
 'parameters':[{'name':'query','in':'query','schema':{'type':'string','maxLength':200}},{'name':'role','in':'query','schema':{'type':'string','enum':['student','teacher','teachingAssistant']}}],
 'responses':{'200':response(obj({'items':array(obj({'userId':string,'username':string,'officialName':string}))})),'403':{'$ref':'#/components/responses/Forbidden'}}}}
document['paths']['/courses/{courseId}/enrollments/{userId}'] = {
 'parameters':[{'$ref':'#/components/parameters/CourseId'},{'name':'userId','in':'path','required':True,'schema':{'type':'string','format':'uuid'}}],
 'patch':{'operationId':'changeCourseEnrollment','tags':['Courses'],'summary':'Owner/Admin changes enrollment with an audit reason, retaining history',
 'requestBody':{'required':True,'content':{'application/json':{'schema':ref('EnrollmentChangeRequest')}}},
 'responses':{'200':response(obj({'userId':string,'status':string})),'403':{'$ref':'#/components/responses/Forbidden'}}}}
path.write_text(yaml.safe_dump(document, sort_keys=False, allow_unicode=True, width=100), 'utf-8')
print('Updated BUILD-03 course input/response contracts and two additional routes.')
