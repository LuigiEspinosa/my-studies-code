import { ChangeEvent, FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import styled from '@emotion/styled';
import { fontFamily, fontSize, gray1, gray2, gray5 } from '../../Styles';
import { UserIcon } from '../Icons';

export const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const criteria = searchParams.get('criteria') || '';

  const [search, setSearch] = useState<string>(criteria);

  const handleSearchInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.currentTarget.value);
  };

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/search?criteria=${search}`);
  };

  return (
    <HeaderContainer>
      <HomeLink to={'/'}>Q & A</HomeLink>

      <form onSubmit={handleSearchSubmit}>
        <StyledInput
          type="text"
          placeholder="Search..."
          onChange={handleSearchInputChange}
          value={search}
        />
      </form>

      <SignButton to={'/signin'}>
        <UserIcon />
        <span>Sign In</span>
      </SignButton>
    </HeaderContainer>
  );
};

const HeaderContainer = styled.div`
  position: fixed;
  box-sizing: border-box;
  top: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background-color: #fff;
  border-bottom: 1px solid ${gray5};
  box-shadow: 0 3px 7px 0 rgba(110, 112, 114, 0.21);
`;

const HomeLink = styled(Link)`
  font-size: 24px;
  font-weight: bold;
  color: ${gray1};
  text-decoration: none;
`;

const StyledInput = styled.input`
  box-sizing: border-box;
  font-family: ${fontFamily};
  font-size: ${fontSize};
  padding: 8px 10px;
  border: 1px solid ${gray5};
  border-radius: 3px;
  color: ${gray2};
  background-color: #fff;
  width: 200px;
  height: 30px;

  :focus {
    outline-color: ${gray5};
  }
`;

const SignButton = styled(Link)`
  font-family: ${fontFamily};
  font-size: ${fontSize};
  padding: 5px 10px;
  background-color: transparent;
  color: ${gray2};
  text-decoration: none;
  cursor: pointer;

  span {
    margin-left: 10px;
  }

  :focus {
    outline-color: ${gray5};
  }
`;
