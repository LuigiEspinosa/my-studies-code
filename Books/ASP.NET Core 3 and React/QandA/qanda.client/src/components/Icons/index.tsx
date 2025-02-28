import user from '../../assets/user.svg';
import styled from '@emotion/styled';

const StyledImg = styled.img`
  width: 12px;
  opacity: 0.6;
`;

export const UserIcon = () => {
  return <StyledImg src={user} alt="User icon in black" />;
};
