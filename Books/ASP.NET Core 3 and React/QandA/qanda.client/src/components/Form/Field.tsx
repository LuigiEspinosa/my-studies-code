import { ChangeEvent, FC, useContext } from 'react';
import { css } from '@emotion/react';
import { fontFamily, fontSize, gray2, gray5, gray6 } from '../../Styles';
import { FormContext } from '.';
import styled from '@emotion/styled';

interface IField {
  name: string;
  label?: string;
  type?: 'Text' | 'TextArea' | 'Password';
}

export const Field: FC<IField> = ({ name, label, type = 'Text' }) => {
  const { setValue, touched, setTouched, validate } = useContext(FormContext);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLTextAreaElement>,
  ) => {
    if (setValue) setValue(name, e.currentTarget.value);
    if (touched[name] && validate) validate(name);
  };

  const handleBlur = () => {
    if (setTouched) setTouched(name);
    if (validate) validate(name);
  };

  return (
    <FormContext.Consumer>
      {({ values, errors }) => (
        <Container>
          {label && <Label htmlFor={name}>{label}</Label>}

          {(type === 'Text' || type === 'Password') && (
            <Input
              id={name}
              type={type.toLowerCase()}
              value={values[name] === undefined ? '' : values[name]}
              onChange={handleChange}
              onBlur={handleBlur}
            />
          )}

          {type === 'TextArea' && (
            <TextArea
              id={name}
              value={values[name] === undefined ? '' : values[name]}
              onChange={handleChange}
              onBlur={handleBlur}
            />
          )}

          {errors[name] &&
            errors[name].length > 50 &&
            errors[name].map((error) => <Error key={error}>{error}</Error>)}
        </Container>
      )}
    </FormContext.Consumer>
  );
};

const baseCSS = css`
  box-sizing: border-box;
  font-family: ${fontFamily};
  font-size: ${fontSize};
  margin-bottom: 5px;
  padding: 8px 10px;
  border: 1px solid ${gray5};
  border-radius: 3px;
  color: ${gray2};
  background-color: white;
  width: 100%;
  :focus {
    outline-color: ${gray5};
  }
  :disabled {
    background-color: ${gray6};
  }
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 15px;
`;

const Label = styled.label`
  font-weight: bold;
`;

const Input = styled.input`
  ${baseCSS}
`;

const TextArea = styled.textarea`
  ${baseCSS}
  height: 100px;
`;

const Error = styled.div`
  font-size: 12px;
  color: #ff0000;
`;
