import { createContext, FC, FormEvent, ReactNode, useState } from 'react';
import styled from '@emotion/styled';
import { gray5, gray6, PrimaryButton } from '../../Styles';

export interface Values {
  [key: string]: any;
}

export interface Errors {
  [key: string]: string[];
}

export interface Touched {
  [key: string]: boolean;
}

interface FormContextProps {
  values: Values;
  setValue?: (fieldName: string, value: any) => void;
  errors: Errors;
  validate?: (fieldName: string) => void;
  touched: Touched;
  setTouched?: (fieldName: string) => void;
}

type Validator = (value: any, args?: any) => string;

export const required: Validator = (value: any): string =>
  value === undefined || value === null || value === ''
    ? 'This must be populated'
    : '';

export const minLength: Validator = (value: any, length: number): string =>
  value && value.length < length
    ? `This must be at least ${length} characters`
    : '';

interface Validation {
  validator: Validator;
  arg?: any;
}

interface ValidationProp {
  [key: string]: Validation | Validation[];
}

export interface SubmitResult {
  success: boolean;
  errors?: Errors;
}

interface IForm {
  submitCaption?: string;
  validationRules?: ValidationProp;
  onSubmit: (values: Values) => Promise<SubmitResult> | void;
  submitResult?: SubmitResult;
  successMessage?: string;
  failureMessage?: string;
  children: ReactNode;
}

export const FormContext = createContext<FormContextProps>({
  values: {},
  errors: {},
  touched: {},
});

export const Form: FC<IForm> = ({
  submitCaption,
  validationRules,
  onSubmit,
  submitResult,
  successMessage = 'Success!',
  failureMessage = 'Something went wrong',
  children,
}) => {
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Touched>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<boolean>(false);

  const validate = (fieldName: string): string[] => {
    if (!validationRules) return [];
    if (!validationRules[fieldName]) return [];

    const rules = Array.isArray(validationRules[fieldName])
      ? (validationRules[fieldName] as Validation[])
      : ([validationRules[fieldName]] as Validation[]);

    const fieldErrors: string[] = [];
    rules.forEach((rule) => {
      const error = rule.validator(values[fieldName], rule.arg);
      if (error) {
        fieldErrors.push(error);
      }
    });

    const newErrors = { ...errors, [fieldName]: fieldErrors };
    setErrors(newErrors);
    return fieldErrors;
  };

  const validateForm = () => {
    const newErrors: Errors = {};
    let haveError: boolean = false;

    if (validationRules) {
      Object.keys(validationRules).forEach((fieldName) => {
        newErrors[fieldName] = validate(fieldName);
        if (newErrors[fieldName].length > 0) haveError = true;
      });
    }

    setErrors(newErrors);
    return !haveError;
  };

  const disabled = submitResult
    ? submitResult.success
    : submitting || (submitted && !submitError);

  const showError = submitResult
    ? !submitResult.success
    : submitted && submitError;

  const showSuccess = submitResult
    ? submitResult.success
    : submitted && !submitError;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (validateForm()) {
      setSubmitting(true);
      setSubmitError(false);
      const result = await onSubmit(values);

      // The result may be passed through as a prop
      if (result === undefined) return;

      setErrors(result.errors || {});
      setSubmitError(!result.success);
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  return (
    <FormContext.Provider
      value={{
        values,
        setValue: (fieldName: string, value: any) => {
          setValues({ ...values, [fieldName]: value });
        },
        errors,
        validate,
        touched,
        setTouched: (fieldName: string) => {
          setTouched({ ...touched, [fieldName]: true });
        },
      }}
    >
      <form noValidate onSubmit={handleSubmit}>
        <FieldSet disabled={disabled}>
          {children}

          <SubmitButton>
            <PrimaryButton type="submit">{submitCaption}</PrimaryButton>
          </SubmitButton>

          {showError && <Error>{failureMessage}</Error>}
          {showSuccess && <Success>{successMessage}</Success>}
        </FieldSet>
      </form>
    </FormContext.Provider>
  );
};

const FieldSet = styled.fieldset`
  margin: 10px auto 0 auto;
  padding: 30px;
  width: 350px;
  background-color: ${gray6};
  border-radius: 4px;
  border: 1px solid ${gray5};
  box-shadow: 0 3px 5px 0 rgba(0, 0, 0, 0.16);
`;

const SubmitButton = styled.div`
  margin: 30px 0px 0px 0px;
  padding: 20px 0px 0px 0px;
  border-top: 1px solid ${gray5};
`;

const Error = styled.p`
  color: #ff0000;
`;

const Success = styled.p`
  color: #008000;
`;
